#[cfg(target_os = "android")]
pub mod commands {
    use tauri::{AppHandle, Manager, command, Emitter};
    use std::io::Write;

    #[command]
    pub async fn download_apk(app: AppHandle, url: String) -> Result<String, String> {
        use futures_util::StreamExt;

        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("Download request failed: {e}"))?;

        let total = response.content_length().unwrap_or(0);
        let cache_dir = app.path().app_cache_dir()
            .map_err(|e| format!("No cache dir: {e}"))?;
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Cannot create cache dir: {e}"))?;

        let file_path = cache_dir.join("update.apk");
        let mut file = std::fs::File::create(&file_path)
            .map_err(|e| format!("Cannot create file: {e}"))?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
            file.write_all(&chunk)
                .map_err(|e| format!("File write error: {e}"))?;
            downloaded += chunk.len() as u64;
            if total > 0 {
                let progress = (downloaded as f64 / total as f64 * 100.0) as u32;
                let _ = app.emit("apk-download-progress", progress);
            }
        }

        Ok(file_path.to_string_lossy().to_string())
    }
}
