//! Windows Toast 的 AUMID 快捷方式自愈注册。
//!
//! 背景：非 MSIX 打包的桌面应用（便携版 / tauri dev）想弹原生 Toast，必须在
//! 开始菜单存在一个带 `System.AppUserModel.ID`（即 tauri.conf.json 的
//! identifier）的快捷方式——这是 Windows 平台的硬性要求，Tauri 的 NSIS/MSI
//! 安装器（SetLnkAppUserModelId 宏）就是靠它让"安装版"通知可用的。
//! seedclaw 日常以 `--no-bundle` 便携方式部署，没有安装器，AUMID 从未注册，
//! 导致 `CreateToastNotifierWithId(identifier)` 的 Show() 被系统静默拒绝。
//!
//! 做法：每次启动（专用 STA 线程，避开 WebView2 的 COM apartment）重建
//! `%APPDATA%\Microsoft\Windows\Start Menu\Programs\seedclaw.lnk`，
//! 指向 current_exe() 并盖上 AUMID 属性。无条件重建换取自愈：换部署目录、
//! 用户误删、安装版卸载后都能在下次启动恢复。
//! 参考：Microsoft Learn《enable-desktop-toast-with-appusermodelid》官方示例。

#![cfg(target_os = "windows")]

use std::{
    ffi::OsStr,
    fs,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
};

use windows::{
    core::{GUID, Interface, PCWSTR},
    Win32::{
        Foundation::PROPERTYKEY,
        System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            CoUninitialize, IPersistFile,
            StructuredStorage::{PROPVARIANT, PropVariantClear},
        },
        System::Variant::VT_LPWSTR,
        UI::Shell::{IShellLinkW, PropertiesSystem::IPropertyStore, SHStrDupW, ShellLink},
    },
};

/// `System.AppUserModel.ID` 的 PROPERTYKEY。
/// 手工构造而非用 PropertiesSystem 的 PKEY 常量，保证不依赖额外 feature 门控。
/// fmtid/pid 出处：https://learn.microsoft.com/windows/win32/properties/props-system-appusermodel-id
const PKEY_APP_USER_MODEL_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
    pid: 5,
};

/// str/Path → 以 NUL 结尾的 UTF-16（Win32 PCWSTR 所需格式）
fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

/// RAII 保证 CoUninitialize 必被调用（含错误提前返回路径）
struct ComGuard;

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

/// 手工实现 propvarutil.h 的 InitPropVariantFromString：
/// SHStrDupW 分配的字符串所有权归 PROPVARIANT，用完须 PropVariantClear。
/// （不用 windows crate 的 InitPropVariantFromString 以少开 feature 门）
fn prop_variant_from_string(value: &[u16]) -> windows::core::Result<PROPVARIANT> {
    let duplicated = unsafe { SHStrDupW(PCWSTR(value.as_ptr())) }?;
    let mut prop_variant = unsafe { std::mem::zeroed::<PROPVARIANT>() };
    unsafe {
        let inner = &mut *prop_variant.Anonymous.Anonymous;
        inner.vt = VT_LPWSTR;
        inner.Anonymous.pwszVal = duplicated;
    }
    Ok(prop_variant)
}

/// 在专用 STA 线程上创建/覆盖快捷方式（STA：Shell COM 属性存储的惯用套间模型）
/// `name` 用于 lnk 的 Description；`app_id` 即 AUMID 属性值
fn create_aumid_shortcut(
    executable: &Path,
    shortcut: &Path,
    name: &str,
    app_id: &str,
) -> Result<(), String> {
    let init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if init_result.is_err() {
        return Err(format!("CoInitializeEx failed: {init_result:?}"));
    }
    let _com_guard = ComGuard;

    let exe_w = wide(executable.as_os_str());
    let shortcut_w = wide(shortcut.as_os_str());
    let app_id_w = wide(OsStr::new(app_id));
    let working_dir_w = wide(
        executable
            .parent()
            .ok_or_else(|| "executable has no parent directory".to_string())?
            .as_os_str(),
    );

    let shell_link: IShellLinkW =
        unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }
            .map_err(|e| format!("CoCreateInstance(ShellLink) failed: {e}"))?;

    unsafe {
        shell_link
            .SetPath(PCWSTR(exe_w.as_ptr()))
            .map_err(|e| format!("SetPath failed: {e}"))?;
        shell_link
            .SetWorkingDirectory(PCWSTR(working_dir_w.as_ptr()))
            .map_err(|e| format!("SetWorkingDirectory failed: {e}"))?;
        shell_link
            .SetDescription(PCWSTR(wide(OsStr::new(name)).as_ptr()))
            .map_err(|e| format!("SetDescription failed: {e}"))?;
        // 图标索引 0 = exe 内嵌的主图标（tauri build 已打入）
        shell_link
            .SetIconLocation(PCWSTR(exe_w.as_ptr()), 0)
            .map_err(|e| format!("SetIconLocation failed: {e}"))?;
    }

    // 盖上 AUMID 属性——本函数存在的全部意义
    let property_store: IPropertyStore = shell_link
        .cast()
        .map_err(|e| format!("cast to IPropertyStore failed: {e}"))?;
    let mut app_id_value =
        prop_variant_from_string(&app_id_w).map_err(|e| format!("SHStrDupW failed: {e}"))?;

    let set_result = unsafe { property_store.SetValue(&PKEY_APP_USER_MODEL_ID, &app_id_value) };
    let commit_result = unsafe { property_store.Commit() };
    // PROPVARIANT 内字符串的所有权在 SetValue/Commit 后即可释放
    unsafe {
        let _ = PropVariantClear(&mut app_id_value);
    }
    set_result.map_err(|e| format!("SetValue(AppUserModel.ID) failed: {e}"))?;
    commit_result.map_err(|e| format!("IPropertyStore::Commit failed: {e}"))?;

    let persist_file: IPersistFile = shell_link
        .cast()
        .map_err(|e| format!("cast to IPersistFile failed: {e}"))?;
    unsafe {
        persist_file
            .Save(PCWSTR(shortcut_w.as_ptr()), true)
            .map_err(|e| format!("IPersistFile::Save failed: {e}"))?;
    }

    Ok(())
}

/// 确保开始菜单存在带 AUMID 的快捷方式。幂等：每次启动无条件重建（自愈）。
/// 失败只记日志不阻断启动——快捷方式缺失时应用其余功能全部正常，仅系统通知不可用。
/// `shortcut_name`（= productName）决定 lnk 文件名：客户端版 / SeedClaw Server 版
/// 两版可并存安装（见 release.yml），各自维护各自的 AUMID 快捷方式互不覆盖。
pub fn ensure_aumid_shortcut(shortcut_name: &str, identifier: &str) -> Result<(), String> {
    let executable =
        std::env::current_exe().map_err(|e| format!("current_exe failed: {e}"))?;

    let app_data =
        std::env::var_os("APPDATA").ok_or_else(|| "APPDATA env var unavailable".to_string())?;
    let shortcut = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join(format!("{shortcut_name}.lnk"));

    if let Some(parent) = shortcut.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create Start Menu dir failed: {e}"))?;
    }

    let exe = executable;
    let lnk = shortcut.clone();
    let app_id = identifier.to_string();
    let name = shortcut_name.to_string();
    std::thread::spawn(move || create_aumid_shortcut(&exe, &lnk, &name, &app_id))
        .join()
        .map_err(|_| "AUMID shortcut thread panicked".to_string())??;

    log::info!(
        "[win_toast] Start Menu shortcut ready: {} (AUMID: {identifier})",
        shortcut.display()
    );
    Ok(())
}
