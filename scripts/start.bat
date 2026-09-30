@echo off
setlocal

docker compose up --build -d
docker compose ps
