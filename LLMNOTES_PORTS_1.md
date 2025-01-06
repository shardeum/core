## Currently Used Ports

### TCP Ports (LISTEN)
- 6463: Discord (127.0.0.1)
- 53: DNS Service (127.0.0.53, 127.0.0.54)
- 631: Printing service (127.0.0.1, [::1])
- 11434: Unknown service (127.0.0.1)
- 52599: Spotify
- 22: SSH
- 57621: Spotify

### UDP Ports
- 5353: Multiple instances (mDNS/Bonjour)
- 1900: Multiple Spotify SSDP instances
- Various ephemeral ports (>32768) used by Chrome and Spotify

### Notes
- Most services are bound to localhost (127.0.0.1) or specific interfaces
- Several multicast addresses in use (224.0.0.251)
- Multiple IPv6 bindings present 