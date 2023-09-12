#!/bin/bash
echo "Replace YOUR_ADDRESS, YOUR_NODE:YOUR_PORT to run the miner"
while :; do
    ./astrominer -w YOUR_ADDRESS -r YOUR_NODE:YOUR_PORT -p rpc;
    sleep 5;
done