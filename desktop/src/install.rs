use std::{
    env, fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};
const ICON: &[u8] = include_bytes!("../../public/assets/icon.svg");
fn directory(variable: &str, fallback: &str) -> Result<PathBuf, String> {
    if let Some(value) = env::var_os(variable).filter(|v| !v.is_empty()) {
        let path = PathBuf::from(value);
        if path.is_absolute() {
            return Ok(path);
        }
    }
    env::var_os("HOME")
        .map(|home| PathBuf::from(home).join(fallback))
        .ok_or_else(|| "Não foi possível encontrar sua pasta pessoal.".into())
}

fn desktop_exec(path: &Path) -> String {
    let mut result = String::from("\"");
    for c in path.to_string_lossy().chars() {
        match c {
            '%' => result.push_str("%%"),
            '\\' => result.push_str("\\\\\\\\"),
            '"' | '`' | '$' => {
                result.push_str("\\\\");
                result.push(c);
            }
            _ => result.push(c),
        }
    }
    result.push('"');
    result
}

pub fn install() -> Result<(), String> {
    let data = directory("XDG_DATA_HOME", ".local/share")?;
    let app = data.join("cineminha");
    let apps = data.join("applications");
    fs::create_dir_all(&app)
        .and_then(|_| fs::create_dir_all(&apps))
        .map_err(|e| e.to_string())?;
    let binary = app.join("cineminha");
    let current = env::current_exe().map_err(|e| e.to_string())?;
    if current != binary {
        let temp = app.join("cineminha.new");
        fs::copy(current, &temp).map_err(|e| e.to_string())?;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
        fs::rename(temp, &binary).map_err(|e| e.to_string())?;
    }
    fs::write(app.join("icon.svg"), ICON).map_err(|e| e.to_string())?;
    let icon = app.join("icon.svg").to_string_lossy().replace('\\', "\\\\");
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Cineminha\nComment=Filmes, amigos e tela inteira com som\nExec={}\nIcon={}\nTerminal=false\nCategories=AudioVideo;\nStartupWMClass=cineminha\n",
        desktop_exec(&binary),
        icon
    );
    fs::write(apps.join("cineminha.desktop"), entry).map_err(|e| e.to_string())?;
    println!(
        "Instalado! Abra Cineminha no menu de aplicativos.\nExecutável: {}",
        binary.display()
    );
    Ok(())
}
