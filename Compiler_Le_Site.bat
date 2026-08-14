@echo off
echo ===================================================
echo   COMPILATION DE LA VERSION FINALE DU SITE
echo ===================================================
echo.
echo Veuillez patienter quelques secondes...
echo.
call npm run build
echo.
echo ===================================================
echo   TERMINE !
echo   Vous pouvez maintenant utiliser le fichier 
echo   "ACCEDER_AU_SITE.html" pour ouvrir votre site !
echo ===================================================
pause
