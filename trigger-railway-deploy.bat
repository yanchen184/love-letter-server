@echo off
echo ========================================
echo   手動觸發 Railway 部署
echo ========================================
echo.

cd /d D:\LibGDX\love-letter-node

echo [觸發部署] 建立空提交...
git commit --allow-empty -m "chore: 手動觸發 Railway 重新部署 Game Hub"

echo [推送到 GitHub] 等待 Railway 自動偵測...
git push origin master

echo.
echo ========================================
echo   部署觸發成功！
echo   請到 Railway Dashboard 檢查部署狀態
echo   https://railway.app/dashboard
echo ========================================
echo.
pause
