@echo off
chcp 65001 >nul
echo 正在停止林非凡交易研究中心...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo 终止进程 PID: %%a
    taskkill /F /PID %%a
)
echo 已停止。
pause
