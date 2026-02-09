# 刪除舊的 memory-battle-server 專案
Write-Host "========================================" -ForegroundColor Red
Write-Host "  刪除 memory-battle-server 專案" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "⚠️  警告：此操作無法復原！" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "確定要刪除 memory-battle-server 嗎？(yes/no)"

if ($confirm -eq "yes") {
    Write-Host "執行刪除..." -ForegroundColor Yellow
    
    # Railway CLI 命令
    # railway project delete memory-battle-server
    
    Write-Host ""
    Write-Host "⚠️  Railway CLI 不支援自動刪除專案" -ForegroundColor Yellow
    Write-Host "請手動在 Railway Dashboard 中刪除：" -ForegroundColor White
    Write-Host "1. 開啟 https://railway.app/dashboard" -ForegroundColor White
    Write-Host "2. 進入 memory-battle-server 專案" -ForegroundColor White
    Write-Host "3. Settings → Danger Zone → Delete Project" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "已取消刪除" -ForegroundColor Green
}
