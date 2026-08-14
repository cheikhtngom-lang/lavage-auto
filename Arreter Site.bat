@echo off
echo Arret du site Lavage Auto en arriere-plan...
taskkill /F /IM node.exe /T >nul 2>&1
echo.
echo Le site a ete completement arrete !
pause
