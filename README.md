[![Pypi version](https://img.shields.io/pypi/v/pywebexec.svg)](https://pypi.org/project/pywebexec/)
![example](https://github.com/joknarf/pywebexec/actions/workflows/python-publish.yml/badge.svg)
[![Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](https://shields.io/)
[![](https://pepy.tech/badge/pywebexec)](https://pepy.tech/project/pywebexec)
[![Python versions](https://img.shields.io/badge/python-3.6+-blue.svg)](https://shields.io/)

# pywebexec
Simple Python HTTP(S) API/Web Command Launcher

## Install
```
$ pip install pywebexec
```

## Quick start

* start http server serving current directory executables listening on 0.0.0.0 port 8080
```
$ pywebexec
```

* Launch commands with params/view live output/Status using browser `http://<yourserver>:8080`

## features

* Serve executables in current directory
* Launch commands with params from web browser
* Follow live output
* Stop command
* Relaunch command
* HTTPS support
* HTTPS self-signed certificate generator
* Can be started as a daemon (POSIX)
* uses gunicorn to serve http/https

## Customize server
```
$ pywebexec --listen 0.0.0.0 --port 8080
$ pywebexec -l 0.0.0.0 -p 8080
```

## Basic auth user/password
```
$ pywebexec --user myuser [--password mypass]
$ pywebfs -u myuser [-P mypass]
```
Generated password is given if no `--pasword` option

## HTTPS server

* Generate auto-signed certificate and start https server
```
$ pywebfs --gencert
$ pywebfs --g
```

* Start https server using existing certificate
```
$ pywebfs --cert /pathto/host.cert --key /pathto/host.key
$ pywebfs -c /pathto/host.cert -k /pathto/host.key
```

## Launch server as a daemon (Linux)

```
$ pywebexec start
$ pywebexec status
$ pywebexec stop
```
* log of server are stored in current directory `.web_status/pwexec_<listen>:<port>.log`

