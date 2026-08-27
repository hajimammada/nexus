@echo off
title Deploy Nexus Dashboard to Cloudflare Pages
cd /d "%~dp0"

echo ========================================================
echo 1. Building latest Dashboard assets...
echo ========================================================
cd client
call npm run build
cd ..

echo ========================================================
echo 2. Deploying to Cloudflare Pages...
echo ========================================================
echo.
echo If prompted to log in, Cloudflare will open your browser.
echo.
npx wrangler pages deploy dist --project-name=nexus-pc-control --commit-dirty=true

echo ========================================================
echo Deployment finished!
echo You can also assign a custom domain (e.g. pc.yourdomain.com) 
echo in Cloudflare Dashboard -> Workers & Pages -> Custom Domains!
echo ========================================================
pause
