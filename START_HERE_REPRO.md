# 林非凡交易研究中心 复现说明

这个包用于在另一台电脑上快速复现当前 林非凡交易研究中心 页面和本地开发环境。

## 包含内容

- 当前完整前端 / 后端 / workflow 代码
- `node_modules`
- `.env.local`，包含本机已配置的 API key
- 便携 Node.js 运行时，适用于 macOS Apple Silicon
- `start-local.command` 一键启动脚本

## 启动方式

1. 解压 zip。
2. 进入解压后的 `silicon-trader` 文件夹。
3. 双击 `start-local.command`，或在终端运行：

```bash
./start-local.command
```

4. 打开：

```text
http://127.0.0.1:3000/
```

## Futu OpenD

A 股 / 港股 / 美股行情优先走本机 Futu OpenD。另一台电脑如果要拿到富途行情，需要：

- 安装并登录 Futu OpenD
- OpenD 监听 `127.0.0.1:8080`
- 账号具备对应市场行情权限

如果 Futu OpenD 没开，系统会尽量 fallback 到公开源，但 A 股 / 港股的覆盖会弱很多。

## 注意

这个复现包包含 API key，只适合发给可信设备或可信同伴，不建议上传到公开网盘、GitHub 或群聊。
