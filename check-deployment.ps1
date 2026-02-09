# Railway Game Hub 部署檢查腳本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Railway Game Hub 部署檢查" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 可能的 URL
$urls = @(
    "https://game-hub-server-production.up.railway.app/health",
    "https://love-letter-server-production.up.railway.app/health"
)

foreach ($url in $urls) {
    Write-Host "檢查: $url" -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        $json = $response.Content | ConvertFrom-Json
        
        Write-Host "✅ 連線成功!" -ForegroundColor Green
        Write-Host "   版本: $($json.version)" -ForegroundColor White
        Write-Host "   遊戲: $($json.games -join ', ')" -ForegroundColor White
        Write-Host "   狀態: $($json.status)" -ForegroundColor White
        
        if ($json.version -eq "2.0.0" -and $json.games -contains "memory-battle") {
            Write-Host "🎉 Game Hub v2.0.0 部署成功!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  還是舊版本或缺少 Memory Battle" -ForegroundColor Yellow
        }
        Write-Host ""
    } catch {
        Write-Host "❌ 無法連線" -ForegroundColor Red
        Write-Host ""
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
