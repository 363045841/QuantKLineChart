#!/bin/bash

# KLineChart 演示网站部署脚本
# 使用方法: ./deploy.sh [环境]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
GITEE_REPO="https://gitee.com/yyt363045841/klinechart.git"
PROJECT_DIR="klinechart"
LEGACY_DIR="kmap"  # 旧版本目录名
ENV=${1:-production}

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}  KLineChart 演示网站部署脚本${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""

# 检查 Git 是否安装
if ! command -v git &> /dev/null; then
    echo -e "${RED}错误: Git 未安装${NC}"
    exit 1
fi

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

# 拉取代码
echo -e "${GREEN}[1/5] 拉取代码...${NC}"

# 清理旧版本目录（如果存在且不是当前项目目录）
if [ -d "$LEGACY_DIR" ] && [ "$LEGACY_DIR" != "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}发现旧版本目录 '$LEGACY_DIR'，正在清理...${NC}"
    rm -rf "$LEGACY_DIR"
fi

# 检查项目目录状态
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"

    # 检查是否是 git 仓库
    if [ ! -d ".git" ]; then
        echo -e "${YELLOW}目录存在但不是 git 仓库，重新克隆...${NC}"
        cd ..
        rm -rf "$PROJECT_DIR"
        git clone "$GITEE_REPO" "$PROJECT_DIR"
        cd "$PROJECT_DIR"
    else
        # 检查远程地址是否正确
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        if [ "$CURRENT_REMOTE" != "$GITEE_REPO" ]; then
            echo -e "${YELLOW}远程地址不匹配，重新克隆...${NC}"
            cd ..
            rm -rf "$PROJECT_DIR"
            git clone "$GITEE_REPO" "$PROJECT_DIR"
            cd "$PROJECT_DIR"
        else
            echo -e "项目目录已存在，拉取最新代码..."
            git fetch origin
            git reset --hard origin/main
            git pull origin main
        fi
    fi
else
    echo -e "克隆项目仓库..."
    git clone "$GITEE_REPO" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# 检查环境变量文件
if [ ! -f .env.deploy ]; then
    echo -e "${YELLOW}警告: .env.deploy 文件不存在，使用默认配置${NC}"
    echo -e "请复制 .env.deploy.example 为 .env.deploy 并修改配置${NC}"
fi

# 构建镜像
echo -e "${GREEN}[2/5] 构建 Docker 镜像...${NC}"
docker-compose build --no-cache

# 停止旧容器
echo -e "${GREEN}[3/5] 停止旧容器...${NC}"
docker-compose down || true

# 启动新容器
echo -e "${GREEN}[4/5] 启动新容器...${NC}"
docker-compose up -d

# 健康检查
echo -e "${GREEN}[5/5] 健康检查...${NC}"
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
