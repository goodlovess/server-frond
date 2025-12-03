#!/bin/bash

# 服务停止脚本
# 用于停止后台运行的 Node.js 服务

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置
PORT=${PORT:-3000}
PID_FILE="server.pid"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 切换到脚本所在目录
cd "$SCRIPT_DIR" || exit 1

# 停止服务
stop_service() {
    local pid=""
    local found=false
    
    # 方法1: 从 PID 文件读取
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            found=true
            echo "从 PID 文件找到进程: $pid"
        else
            # PID 文件存在但进程不存在，清理 PID 文件
            rm -f "$PID_FILE"
        fi
    fi
    
    # 方法2: 通过端口查找
    if [ "$found" = false ]; then
        port_pid=$(lsof -ti:$PORT 2>/dev/null)
        if [ -n "$port_pid" ]; then
            pid="$port_pid"
            found=true
            echo "通过端口 $PORT 找到进程: $pid"
        fi
    fi
    
    # 方法3: 通过进程名查找
    if [ "$found" = false ]; then
        process_pid=$(pgrep -f "node index.js" | head -n 1)
        if [ -n "$process_pid" ]; then
            pid="$process_pid"
            found=true
            echo "通过进程名找到进程: $pid"
        fi
    fi
    
    if [ "$found" = false ]; then
        echo -e "${YELLOW}服务未运行${NC}"
        rm -f "$PID_FILE"
        return 0
    fi
    
    # 停止进程
    echo "正在停止服务 (PID: $pid)..."
    kill "$pid" 2>/dev/null
    
    # 等待进程结束（最多等待 10 秒）
    local count=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
        sleep 1
        count=$((count + 1))
    done
    
    # 如果进程还在运行，强制停止
    if ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${YELLOW}进程未正常退出，强制停止...${NC}"
        kill -9 "$pid" 2>/dev/null
        sleep 1
    fi
    
    # 验证进程是否已停止
    if ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${RED}✗ 停止服务失败 (PID: $pid)${NC}"
        return 1
    else
        echo -e "${GREEN}✓ 服务已停止 (PID: $pid)${NC}"
        rm -f "$PID_FILE"
        return 0
    fi
}

# 主函数
main() {
    echo "正在停止服务..."
    stop_service
}

main
