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

* put in a directory the scripts/commands/links to commands you want to expose
* start http server serving current directory executables listening on 0.0.0.0 port 8080
```shell
$ pywebexec
```

* Launch commands with params/view live output/Status using browser
![pywebexec](https://github.com/user-attachments/assets/1bfec34f-8e3b-4ad0-b6c4-c03c957c070a)

## features

* Serve executables in a directory
* Launch commands with params from web browser or API call
* Follow live output
* Stop command
* Relaunch command
* HTTPS support
* HTTPS self-signed certificate generator
* Basic Auth
* LDAP(S)
* Can be started as a daemon (POSIX)
* uses gunicorn to serve http/https
* compatible Linux/MacOS

## Customize server
```shell
$ pywebexec --dir ~/myscripts --listen 0.0.0.0 --port 8080
$ pywebexec -d ~/myscripts -l 0.0.0.0 -p 8080
```

## Basic auth 

* single user/password
```shell
$ pywebexec --user myuser [--password mypass]
$ pywebexec -u myuser [-P mypass]
```
Generated password is given if no `--pasword` option

* ldap(s) password check / group member
```shell
$ export PYWEBEXEC_LDAP_SERVER=ldap.forumsys.com
$ export PYWEBEXEC_LDAP_USE_SSL=0
$ export PYWEBEXEC_LDAP_BIND_DN="cn=read-only-admin,dc=example,dc=com"
$ export PYWEBEXEC_LDAP_BIND_PASSWORD="password"
$ export PYWEBEXEC_LDAP_GROUPS=mathematicians,scientists
$ export PYWEBEXEC_LDAP_USER_ID="uid"
$ export PYWEBEXEC_LDAP_BASE_DN="dc=example,dc=com"
$ pywebexec
```
## HTTPS server

* Generate auto-signed certificate and start https server
```shell
$ pywebfs --gencert
$ pywebfs --g
```

* Start https server using existing certificate
```shell
$ pywebfs --cert /pathto/host.cert --key /pathto/host.key
$ pywebfs -c /pathto/host.cert -k /pathto/host.key
```

## Launch server as a daemon

```shell
$ pywebexec start
$ pywebexec status
$ pywebexec stop
```
* log of server are stored in directory `[.config/].pywebexec/pywebexec_<listen>:<port>.log`

## Launch command through API

```shell
$ curl http://myhost:8080/run_script -H 'Content-Type: application/json' -X POST -d '{ "script_name":"myscript", "param":["param1", ...]}
```

## API reference


| method    | route                       | params/payload     | returns
|-----------|-----------------------------|--------------------|---------------------|
| POST      | /run_command                | command: str<br>params: array[str]       | command_id: uuid<br>message: str    |
| POST      | /stop_command/command_id    |                    | message: str        |
| GET       | /command_status/command_id  |                    | command_id: uuid<br>command: str<br>params: array[str]<br>start_time: isotime<br>end_time: isotime<br>status: str<br>exit_code: int      |
| GET       | /command_output/command_id  |                    | output: str<br>status: str         |
| GET       | /commands                   |                    | array of<br>command_id: uuid<br>command: str<br>start_time: isotime<br>end_time: isotime<br>status: str<br>exit_code: int      |
| GET       | /executables                |                    | array of str        |
