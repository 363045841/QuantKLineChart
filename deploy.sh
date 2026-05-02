#!/bin/bash

# KLineChart 演示网站部署脚本
# 使用方法: ./deploy.sh [环境]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认环境
ENV=${1:-production}

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}  KLineChart 演示网站部署脚本${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

# 检查环境变量文件
if [ ! -f .env.deploy ]; then
    echo -e "${YELLOW}警告: .env.deploy 文件不存在，使用默认配置${NC}"
    echo -e "请复制 .env.deploy.example 为 .env.deploy 并修改配置${NC}"
fi

# 构建镜像
echo -e "${GREEN}[1/4] 构建 Docker 镜像...${NC}"
docker-compose build --no-cache

# 停止旧容器
echo -e "${GREEN}[2/4] 停止旧容器...${NC}"
docker-compose down || true

# 启动新容器
echo -e "${GREEN}[3/4] 启动新容器...${NC}"
docker-compose up -d

# 健康检查
echo -e "${GREEN}[4/4] 健康检查...${NC}"
sleep 5

if docker-compose ps | grep -q "healthy\|Up"; then
    echo -e "${GREEN}✓ 部署成功!${NC}"
    echo ""
    echo -e "访问地址: ${YELLOW}http://localhost:3000${NC}"
    echo ""
    echo -e "${YELLOW}注意:${NC}"
    echo -e "  - 如果需要从外部访问，请确保防火墙已开放 3000 端口"
    echo -e "  - 数据源需要配置 VPN/SSH 隧道连接到本地"
    echo -e "  - 查看日志: docker-compose logs -f"
else
    echo -e "${RED}✗ 部署可能失败，请检查日志${NC}"
    docker-compose logs
    exit 1
fi
