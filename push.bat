@echo off
echo ========================================
echo   VALO-ROULETTE AUTO PUSH TO GITHUB
echo ========================================

:: 1. 詢問更新說明
set /p msg="Enter commit message (Default: auto update): "

:: 2. 如果沒輸入說明，就用預設值
if "%msg%"=="" set msg="auto update"

:: 3. 執行 Git 指令
echo Adding files...
git add .

echo Committing changes with message: %msg%
git commit -m "%msg%"

echo Pushing to GitHub...
git push

echo.
echo ========================================
echo   DEPLOY COMPLETE! Cloudflare is building...
echo ========================================
pause