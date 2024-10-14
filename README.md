# homebridge-pioneer-vsx-2025
homebridge-pioneer-avr Ready for Node 22 or lower

This project was forked from [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr).

homebridge-pioneer-avr is a plugin made for [homebridge](https://github.com/nfarina/homebridge),
which declare your Pioneer AVR as a TV in homekit.

## Features

Declare your AVR as a homekit TV :
* Turn AVR On/Off
* Auto discover inputs
* Select active input in home app
* Select inputs to shown in the input list
* Save visibility status for inputs
* Rename inputs in home apps
* Control volume through the command in control center
* Control AVR with Remote in Control Center on iOS

## Installation

1. Install the homebridge framework using `npm install -g homebridge`
2. Install **homebridge-pioneer-vsx-2025** using `npm i homebridge-pioneer-vsx-2025`
3. Update your configuration file. See `sample-config.json` in this repository for a sample.

## Accessory configuration example

```json
"accessories": [
	{
        "accessory": "pioneerAvrAccessory",
        "model": "VSX-922",
        "name": "My Pioneer AVR",
        "description": "AV Receiver",
        "host": "192.168.178.99",
        "port": 23
	}
]
```

*Notice: If port 23 does not work, try port 8102.

## Links

https://github.com/rwifall/pioneer-receiver-notes

https://github.com/merdok/homebridge-webos-tv

https://github.com/TG908/homebridge-vsx

## Release Notes

### v0.0.3
Input 46 -> AIRPLAY added

### v0.0.2
* Fixes

### v0.0.1
* Enhanced performance and responsiveness of the Pioneer AVR receiver.
* Maintained a single Telnet session for faster command execution.
* Ensured compatibility with the latest Homebridge and Node.js versions.
* Node.js 20 LTS: No issues; Node.js 22: Deprecated warning, but fully functional.
* General improvements for better reliability.

Update recommended for optimal performance. ;)

### v0.0.0
* Forked homebridge-pioneer-avr
