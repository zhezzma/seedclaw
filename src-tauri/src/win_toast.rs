//! Windows Toast 的身份注册与通知中心点击激活。
//!
//! ## 背景：三件事
//!
//! 1. **AUMID 快捷方式**（非 MSIX 弹 Toast 的硬性要求）：
//!    非 MSIX 打包的桌面应用（便携版 / tauri dev）想弹原生 Toast，必须在
//!    开始菜单存在一个带 `System.AppUserModel.ID`（即 tauri.conf.json 的
//!    identifier）的快捷方式。Tauri 的 NSIS/MSI 安装器
//!    （SetLnkAppUserModelId 宏）就是靠它让"安装版"通知可用的；
//!    seedclaw 日常以 `--no-bundle` 便携方式部署，没有安装器，必须在启动时
//!    自建。做法：专用 STA 线程重建 `%APPDATA%\...\Programs\{productName}.lnk`，
//!    无条件重建换取自愈（换部署目录/误删/卸载后下次启动恢复）。
//!
//! 2. **通知中心（Action Center）点击激活**：
//!    横幅期点击由通知插件 fork 挂的进程内 Activated 事件处理；
//!    但横幅消失进通知中心后，进程内事件不再触发（Windows 设计如此），
//!    必须注册 COM activator（INotificationActivationCallback）。
//!    便携版非 MSIX 无 manifest 声明，走注册表方案（MS 官方
//!    《Send a local toast notification from desktop apps》）：
//!    - `HKCU\Software\Classes\AppUserModelId\{AUMID}\CustomActivator = {CLSID}`
//!    - `HKCU\Software\Classes\CLSID\{CLSID}\LocalServer32 = exe 路径`
//!    进程存活时（seedclaw 常驻托盘，真实唯一场景）Windows 直接调
//!    进程内 CoRegisterClassObject 注册的 activator；进程死后则经
//!    LocalServer32 冷启动拉起 exe（webview 未就绪时点击 payload 丢失，见下）。
//!    （冷启动限制与后续优化方向见底部「冷启动限制」。）
//!
//! 3. **CLSID 派生**：客户端版 / SeedClaw Server 版两版可并存安装
//!    （见 release.yml），CLSID 从 identifier 确定性派生（双 offset FNV-64 拼合），
//!    两版各自独立互不冲突，也避免硬编码常量跨版本漂移。
//!
//! **冷启动限制**：进程死后点历史通知，Windows 会经 LocalServer32 拉起 exe
//! 并把 launch JSON 投递给新进程的 Activate——但此时 webview 尚未就绪、
//! 前端 listener 未注册，emit 丢失，落在默认页不跳转（后续可仿插件 fork 的
//! pending_clicks 思路在前端就绪后补发）。
//!
//! 参考：Microsoft Learn《enable-desktop-toast-with-appusermodelid》
//! 《send-local-toast-desktop》官方示例。

// The `windows_core::implement` macro（ToastClickedActivator / Factory）展开会生成
// `#[inline(always)]` 访问器与 `&T as *const T` 转换，lint 落在本文件 span 上，
// 无法在源码表达式处消除（与通知插件 fork 的 windows.rs 同源问题）。
#![allow(clippy::inline_always, clippy::ref_as_ptr)]

#![cfg(target_os = "windows")]

use std::{
    ffi::OsStr,
    fs,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use tauri::{AppHandle, Emitter, Manager};
use windows::{
    core::{GUID, Interface, PCWSTR, implement},
    Win32::{
        Foundation::{CLASS_E_NOAGGREGATION, ERROR_SUCCESS, PROPERTYKEY},
        System::{
            Com::{
                CLSCTX_LOCAL_SERVER, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
                CoCreateInstance, CoInitializeEx, CoRegisterClassObject, CoUninitialize,
                IClassFactory, IClassFactory_Impl, IPersistFile, REGCLS_MULTIPLEUSE,
                StructuredStorage::{PROPVARIANT, PropVariantClear},
            },
            Registry::{
                HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ,
                RegCloseKey, RegCreateKeyExW, RegSetValueExW,
            },
            Variant::VT_LPWSTR,
        },
        UI::{
            Notifications::{INotificationActivationCallback, INotificationActivationCallback_Impl, NOTIFICATION_USER_INPUT_DATA},
            Shell::{IShellLinkW, PropertiesSystem::IPropertyStore, SHStrDupW, ShellLink},
        },
    },
};

/// 通知中心点击 → 前端的事件名（payload = toast launch JSON：`{id, data:{sessionKey}}`）。
/// 前端 useNotify.ts 监听并复用横幅点击的「恢复窗口 + 跳转会话」处理。
pub const TOAST_ACTIVATED_EVENT: &str = "notify://toast-activated";

/// 进程级 AppHandle 引用：COM Activate 回调在 RPC 线程触发，经它 emit 事件。
/// AppHandle 是 Clone 且进程存活期间有效，存全局不延长 app 生命周期。
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

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

/// 从 identifier 确定性派生 CLSID（FNV-1a 128：两个不同 offset 的 FNV-64 拼合）。
/// 非加密用途——只要求跨进程/跨版本稳定且不撞车（AUMID 命名空间由我们控制）。
fn derive_clsid(identifier: &str) -> GUID {
    const FNV_OFFSET_1: u64 = 0xcbf29ce484222325;
    const FNV_OFFSET_2: u64 = 0x9e3779b97f4a7c15; // 黄金比例常数，与 offset_1 天然不同
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut h1 = FNV_OFFSET_1;
    let mut h2 = FNV_OFFSET_2;
    for b in identifier.as_bytes() {
        h1 = (h1 ^ u64::from(*b)).wrapping_mul(FNV_PRIME);
        h2 = (h2 ^ u64::from(*b)).wrapping_mul(FNV_PRIME);
    }
    GUID::from_values(
        (h1 >> 32) as u32,
        h1 as u16,
        (h1 >> 16) as u16,
        h2.to_be_bytes(),
    )
}

// ─── COM activator：接住通知中心点击 ───────────────────────────
//
// 模式照抄通知插件 fork 的 ToastActivator（MS 官方 desktop toast 示例）：
// out-of-proc COM 要求 CoRegisterClassObject 收 IClassFactory，factory 的
// CreateInstance 再产出真正实现 INotificationActivationCallback 的 activator。

/// 点击激活回调（RPC 线程触发）。`invokedargs` = toast XML 的 launch 属性
/// （通知插件写入的 JSON：`{id, data:{sessionKey}}`）。
/// 注：seedclaw 不使用 toast 动作按钮，非 JSON 的 invokedargs（按钮场景）
/// 统一按点击处理（恢复窗口不跳转）——若将来加按钮需在此区分。
#[implement(INotificationActivationCallback)]
struct ToastClickedActivator;

impl INotificationActivationCallback_Impl for ToastClickedActivator_Impl {
    fn Activate(
        &self,
        _appusermodelid: &PCWSTR,
        invokedargs: &PCWSTR,
        _data: *const NOTIFICATION_USER_INPUT_DATA,
        _count: u32,
    ) -> windows::core::Result<()> {
        let invoked = unsafe { invokedargs.to_string() }.unwrap_or_default();
        let payload: serde_json::Value = serde_json::from_str(&invoked)
            .unwrap_or(serde_json::json!({ "data": {} }));

        if let Some(app) = APP_HANDLE.get() {
            if let Err(e) = app.emit(TOAST_ACTIVATED_EVENT, payload) {
                log::error!("[win_toast] emit {TOAST_ACTIVATED_EVENT} failed: {e}");
            }
        }
        Ok(())
    }
}

/// IClassFactory：COM 激活的入口，产出上面的 activator 实例。
#[implement(IClassFactory)]
struct ToastClickedActivatorFactory;

impl IClassFactory_Impl for ToastClickedActivatorFactory_Impl {
    fn CreateInstance(
        &self,
        punkouter: windows::core::Ref<'_, windows::core::IUnknown>,
        riid: *const GUID,
        ppvobject: *mut *mut core::ffi::c_void,
    ) -> windows::core::Result<()> {
        if !punkouter.is_null() {
            return Err(CLASS_E_NOAGGREGATION.into());
        }
        let activator: INotificationActivationCallback = ToastClickedActivator.into();
        unsafe { activator.query(riid, ppvobject).ok() }
    }

    fn LockServer(&self, _flock: windows::core::BOOL) -> windows::core::Result<()> {
        Ok(())
    }
}

// ─── 快捷方式创建（专用 STA 线程） ───────────────────────────────

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

    // 盖上 AUMID 属性——快捷方式存在的全部意义
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

// ─── 注册表：CustomActivator / LocalServer32 自愈 ────────────────

/// HKCU 下创建（或打开）子键并写一个 REG_SZ 值。
fn reg_set_sz(subkey: &str, name: &str, value: &str) -> Result<(), String> {
    let subkey_w = wide(OsStr::new(subkey));
    let name_w = wide(OsStr::new(name));
    let value_w = wide(OsStr::new(value));

    let mut hkey = HKEY::default();
    // lpclass 传 null：泛型 Param<PCWSTR> 不接受 None，用 PCWSTR::null() 表达空
    let result = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey_w.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut hkey,
            None,
        )
    };
    if result != ERROR_SUCCESS {
        return Err(format!("RegCreateKeyExW({subkey}) failed: 0x{:08X}", result.0));
    }

    let bytes: Vec<u8> = value_w
        .iter()
        .flat_map(|c| c.to_le_bytes())
        .collect();
    let result = unsafe {
        RegSetValueExW(
            hkey,
            PCWSTR(name_w.as_ptr()),
            None,
            REG_SZ,
            Some(bytes.as_slice()),
        )
    };
    unsafe {
        let _ = RegCloseKey(hkey);
    }
    if result != ERROR_SUCCESS {
        return Err(format!("RegSetValueExW({subkey}\\{name}) failed: 0x{:08X}", result.0));
    }
    Ok(())
}

/// 写激活注册表（幂等，每次启动自愈——exe 路径可能随部署目录变化）。
/// LocalServer32 值带引号包路径：路径含空格时 COM 启动命令行才不会被截断。
fn write_activation_registry(identifier: &str, clsid: GUID, executable: &Path) -> Result<(), String> {
    let clsid_str = format!("{{{clsid}}}");
    let exe_quoted = format!("\"{}\"", executable.display());

    reg_set_sz(
        &format!("Software\\Classes\\AppUserModelId\\{identifier}"),
        "CustomActivator",
        &clsid_str,
    )?;
    // COM 标准形状：LocalServer32 是 {CLSID} 下的子键，其默认（无名）值 = 服务路径。
    // 值名传空串即写默认值；路径带引号防含空格目录被截断
    reg_set_sz(
        &format!("Software\\Classes\\CLSID\\{clsid_str}\\LocalServer32"),
        "",
        &exe_quoted,
    )?;
    Ok(())
}

// ─── 入口 ─────────────────────────────────────────────────────

/// Windows Toast 身份与激活注册总入口（lib.rs setup 调用，仅一次）。
/// 任何一步失败只记日志不阻断启动——缺失时应用其余功能全部正常，仅通知受限。
pub fn setup(app: &AppHandle) {
    let config = app.config();
    // lnk 文件名用 productName（与 NSIS 安装器命名一致）：客户端/Server 两版
    // 可并存（release.yml），各自的 AUMID 快捷方式与 CLSID 互不覆盖
    let shortcut_name = config
        .product_name
        .clone()
        .unwrap_or_else(|| config.identifier.clone());
    let identifier = config.identifier.clone();

    let _ = APP_HANDLE.set(app.clone());

    // 1. 开始菜单 AUMID 快捷方式（专用 STA 线程，毫秒级阻塞换取错误可同步上报）
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            log::warn!("[win_toast] current_exe failed: {e}");
            return;
        }
    };
    let app_data = match std::env::var_os("APPDATA") {
        Some(v) => v,
        None => {
            log::warn!("[win_toast] APPDATA env var unavailable");
            return;
        }
    };
    let shortcut = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join(format!("{shortcut_name}.lnk"));

    let shortcut_result = (|| -> Result<(), String> {
        if let Some(parent) = shortcut.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("create Start Menu dir failed: {e}"))?;
        }
        let exe = exe.clone();
        let lnk = shortcut.clone();
        let name = shortcut_name.clone();
        let app_id = identifier.clone();
        std::thread::spawn(move || create_aumid_shortcut(&exe, &lnk, &name, &app_id))
            .join()
            .map_err(|_| "AUMID shortcut thread panicked".to_string())?
    })();
    match shortcut_result {
        Ok(()) => log::info!(
            "[win_toast] Start Menu shortcut ready: {} (AUMID: {identifier})",
            shortcut.display()
        ),
        Err(e) => log::warn!("[win_toast] ensure AUMID shortcut failed: {e}"),
    }

    // 2. 通知中心点击激活：先注册进程内 COM activator，后写注册表——缩小
    // 「注册表已指向本进程外但类对象还没就绪」的窗口（期间冷启动会走 LocalServer32）
    let clsid = derive_clsid(&identifier);

    // 主线程（tauri 事件循环线程）注册：STA 回调依赖消息泵，这里天然满足。
    // CoInitializeEx 幂等（S_FALSE 也算成功），与 WebView2 的 STA 初始化兼容。
    let init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if init_result.is_err() {
        log::warn!("[win_toast] CoInitializeEx failed: {init_result:?}");
        return;
    }
    let factory: IClassFactory = ToastClickedActivatorFactory.into();
    let register_result = unsafe {
        CoRegisterClassObject(
            &clsid,
            &factory,
            CLSCTX_LOCAL_SERVER,
            REGCLS_MULTIPLEUSE,
        )
    };
    match register_result {
        Ok(_cookie) => log::info!(
            "[win_toast] toast activator registered (clsid={clsid}, aumid={identifier})"
        ),
        Err(e) => log::warn!("[win_toast] CoRegisterClassObject failed: {e}"),
    }
    // cookie 故意不 revoke：进程退出时 OS 自动回收，且退出前通知中心点击仍需它存活

    // 注册表自愈（每次启动重写：exe 路径可能随部署目录变化）
    if let Err(e) = write_activation_registry(&identifier, clsid, &exe) {
        log::warn!("[win_toast] activation registry failed: {e}");
    }
}
