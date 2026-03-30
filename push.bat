@echo off
echo ========================================
echo   VALO-ROULETTE AUTO PUSH TO GITHUB
echo ========================================

:: 1. 詢問更新說明
set /p input="Enter commit message (Default: auto update): "

:: 2. 處理變數：如果沒輸入，就設定為 auto update
if "%input%"=="" (
    set msg=auto update
) else (
    set msg=%input%
)

:: 3. 執行 Git 指令
echo.
echo [1/3] Adding files...
git add .

echo [2/3] Committing changes...
:: 這裡只在執行時加一次引號
git commit -m "%msg%"

echo [3/3] Pushing to GitHub...
git push

echo.
echo ========================================
echo   DEPLOY COMPLETE! Cloudflare is building...
echo ========================================
pause