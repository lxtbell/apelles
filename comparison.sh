#!/usr/bin/env bash
if [[ $# -eq 0 ]] ; then
    echo "Usage: $0 port [other arguments to comparison.js]"
    exit 1
fi

CURRENT_PATH="`dirname \"$0\"`"
COMPARISON_JS_PATH="$CURRENT_PATH/comparison.js"
SCREEN_NAME="apelles$1"

if ! screen -ls | grep -q "$SCREEN_NAME"; then
	screen -dmS $SCREEN_NAME node $COMPARISON_JS_PATH --port $1 ${@:2}
fi
screen -x $SCREEN_NAME
