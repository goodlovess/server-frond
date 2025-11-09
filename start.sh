#!/bin/bash

# 服务启动脚本
# 用于后台启动 Node.js 服务

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置
PORT=${PORT:-3000}
PID_FILE="server.pid"
LOG_FILE="server.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 切换到脚本所在目录
cd "$SCRIPT_DIR" || exit 1

# 检查服务是否已经在运行
check_running() {
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}警告: 服务已经在运行中 (PID: $OLD_PID)${NC}"
            echo "如需重启，请先运行 ./stop.sh"
            exit 1
        else
            # PID 文件存在但进程不存在，删除旧的 PID 文件
            rm -f "$PID_FILE"
        fi
    fi
    
    # 检查端口是否被占用
    if lsof -ti:$PORT > /dev/null 2>&1; then
        echo -e "${RED}错误: 端口 $PORT 已被占用${NC}"
        echo "请先停止占用该端口的服务，或运行 ./stop.sh"
        exit 1
    fi
}

# 检查必要的文件
check_requirements() {
    if [ ! -f "package.json" ]; then
        echo -e "${RED}错误: 未找到 package.json 文件${NC}"
        exit 1
    fi
    
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}警告: 未找到 node_modules 目录${NC}"
        echo "正在安装依赖..."
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}错误: 依赖安装失败${NC}"
            exit 1
        fi
    fi
    
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}警告: 未找到 .env 文件${NC}"
        if [ -f ".env.example" ]; then
            echo "请基于 .env.example 创建 .env 文件"
        fi
    fi
}

# 启动服务
start_service() {
    echo "正在启动服务..."
    echo "端口: $PORT"
    echo "日志文件: $LOG_FILE"
    
    # 启动服务
    nohup npm start > "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    
    # 保存进程 ID
    echo $NEW_PID > "$PID_FILE"
    
    # 等待一下，检查进程是否还在运行
    sleep 2
    
    if ps -p "$NEW_PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 服务启动成功！${NC}"
        echo "进程 ID: $NEW_PID"
        echo "日志文件: $LOG_FILE"
        echo ""
        echo "查看日志: tail -f $LOG_FILE"
        echo "停止服务: ./stop.sh"
    else
        echo -e "${RED}✗ 服务启动失败${NC}"
        echo "请查看日志文件: $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

# 主函数
main() {
    check_running
    check_requirements
    start_service
}

main
