# Daemon 安装、Web 管理台与客户端配对

本文说明如何通过 npm 安装见山 daemon、首次启动、启用登录启动项、打开本机 Web 管理台，并为手机客户端生成配对链接。

## 1. 安装

安装 CLI：

```bash
npm install -g @getpaseo/cli
```

确认命令可用：

```bash
paseo --version
```

`npm install` 只安装程序和 CLI，不会启动 daemon，也不会自动创建登录启动项。

## 2. 首次启动

手动启动 daemon：

```bash
paseo daemon start
```

首次成功启动会：

- 在 `~/.paseo` 创建运行状态和默认配置。
- 启动 daemon，默认监听 `127.0.0.1:6767`。
- 启动独立的本机 Web 管理台，默认监听 `127.0.0.1:6769`。
- 自动配置当前用户的登录启动项。
- 默认启用官方 Relay。

检查状态：

```bash
paseo daemon status
paseo daemon autostart status
```

登录启动项按当前用户安装：

- Linux：`~/.config/systemd/user/paseo-daemon.service`
- Windows：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Paseo Daemon.cmd`

Linux 需要当前用户可用的 systemd user manager。Windows 不需要管理员权限。

如不希望以后启动 daemon 时自动启用登录启动项，可以显式关闭：

```bash
paseo daemon autostart disable
```

关闭会记录用户选择，后续 `paseo daemon start` 不会擅自重新开启。需要恢复时运行：

```bash
paseo daemon autostart enable
```

## 3. 打开 Web 管理台

查看管理台地址：

```bash
paseo admin url
```

默认地址：

```text
http://127.0.0.1:6769/
```

查看登录密钥：

```bash
paseo admin key
```

全新安装的默认密钥是：

```text
123456
```

在浏览器打开管理台地址，输入密钥登录。登录后可在 **设置 → 管理密钥** 中重置密钥。重置后所有已登录浏览器都会退出。

> 默认密钥只适合首次本机配置。即使管理台仅监听 loopback，也建议尽快改为更长的随机密钥。

### 远程服务器

管理台默认只监听服务器的 loopback，不建议直接暴露到公网。在本地电脑建立 SSH 隧道：

```bash
ssh -L 6769:127.0.0.1:6769 user@server
```

保持 SSH 会话运行，然后在本地浏览器打开：

```text
http://127.0.0.1:6769/
```

## 4. 生成配对链接

在 Web 管理台进入 **角色**：

1. 输入角色名称，例如 `张三`。
2. 选择角色类型：`member`（普通成员）或 `admin`（管理员）。
3. 点击 **生成配对二维码**。
4. 页面显示二维码和完整配对链接。

角色名称和类型等同于：

```bash
paseo daemon pair --name "张三" --role admin
```

不传 `--role` 时默认为 `member`。后续提问会记录该客户端名称，用于团队统计。

`admin` 客户端的左侧栏会显示 **团队** 入口；`member` 不显示。管理台还可以重新生成二维码并重新选择角色类型，或删除不再使用的角色入口。

二维码和配对链接可以重复使用。同一个角色名称可以用于多台设备。

也可以不打开管理台，直接在命令行生成：

```bash
paseo daemon pair --name "张三" --role admin
```

## 5. 手机客户端连接

1. 在手机安装见山客户端。
2. 打开“扫描二维码”。
3. 扫描 Web 管理台生成的二维码。
4. 客户端读取配对链接并保存 Host。
5. 如 daemon 配置了访问密码，客户端会要求输入密码。
6. 连接成功后，手机会显示该 Host 的 Agent、Workspace 和 Terminal。

如果二维码无法扫描，可以在手机中手动粘贴管理台“复制链接”按钮得到的配对链接。

`admin` 角色点击客户端中的 **团队** 后，会进入客户端内置的原生团队页面。页面通过 daemon RPC 读取与管理台团队页相同的成员统计、时间分布、Token 和热力图数据，不打开外部浏览器，也不依赖管理台地址可达。

## 6. Relay 与直接连接

全新安装默认启用官方 Relay。Relay 用于：

- 让 daemon 主动连接公网中转服务，无需公网 IP 或路由器端口映射。
- 让手机在不同网络环境下连接 daemon。
- 在地址变化或短暂断线后重新建立连接。

官方默认值：

```json
{
  "daemon": {
    "relay": {
      "enabled": true,
      "endpoint": "relay.paseo.sh:443",
      "publicEndpoint": "relay-next.paseo.sh:443",
      "useTls": true,
      "publicUseTls": true
    }
  }
}
```

关闭 Relay 后：

- 默认的 `127.0.0.1` daemon 不能被手机远程访问。
- 管理台无法生成可用的远程配对链接。
- 需要通过局域网直连、Tailscale、SSH 隧道或反向代理访问。

Relay 的启用状态、端点和 TLS 可在 **设置** 中查看。修改启动期配置后，按页面提示完整重启 daemon。

## 7. 重启与停止

重启 daemon worker：

```bash
paseo daemon restart
```

完整停止：

```bash
paseo daemon stop
```

再次启动：

```bash
paseo daemon start
```

修改监听地址、Relay endpoint、日志或 Web UI 等启动期配置时，需要完整执行 `stop` 后 `start`。

## 8. 常见检查

检查 daemon：

```bash
paseo daemon status --json
```

检查管理台：

```bash
paseo admin url
curl http://127.0.0.1:6769/healthz
```

检查登录启动项：

```bash
paseo daemon autostart status --json
```

查看日志：

```bash
tail -f ~/.paseo/daemon.log
```

Windows 可在 PowerShell 中查看：

```powershell
Get-Content "$env:USERPROFILE\.paseo\daemon.log" -Tail 100 -Wait
```

配对失败时依次确认：

- daemon 状态为 `running`。
- 管理台 `/healthz` 返回 `{"status":"ok"}`。
- Relay 已启用。
- `endpoint` 与 `publicEndpoint` 指向同一个可访问的 Relay。
- 手机网络能够解析 Relay 域名并访问对应端口。
