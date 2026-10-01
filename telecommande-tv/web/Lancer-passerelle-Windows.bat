@echo off
chcp 65001 >nul
title Telecommande TV - passerelle Wi-Fi
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 passerelle_tv.py
  goto fin
)
where python >nul 2>nul
if %errorlevel%==0 (
  python passerelle_tv.py
  if not errorlevel 9009 goto fin
)
:installer
echo.
echo  Python n'est pas installe sur cet ordinateur.
echo  1. La page de telechargement va s'ouvrir : installe Python (bouton jaune).
echo     Pendant l'installation, coche "Add python.exe to PATH".
echo  2. Puis double-clique a nouveau sur ce fichier.
echo.
start "" https://www.python.org/downloads/
:fin
echo.
pause
