import subprocess
import ipaddress
import platform
from scapy.all import *
from socket import gethostname, gethostbyname_ex, gethostbyaddr, inet_aton, inet_ntoa, AF_INET, SOCK_STREAM

def resolve_hostname(host):
    """try get fqdn from DNS/hosts"""
    try:
        hostinfo = gethostbyname_ex(host)
        return (hostinfo[0].rstrip('.'), hostinfo[2][0])
    except OSError:
        return (host, host)


def resolve_ip(ip):
    """try resolve hostname by reverse dns query on ip addr"""
    ip = inet_ntoa(inet_aton(ip))
    try:
        ipinfo = gethostbyaddr(ip)
        return (ipinfo[0].rstrip('.'), ipinfo[2][0])
    except OSError:
        return (ip, ip)


def is_ip(host):
    """determine if host is valid ip"""
    try:
        inet_aton(host)
        return True
    except OSError:
        return False


def resolve(host_or_ip):
    """resolve hostname from ip / hostname"""
    if is_ip(host_or_ip):
        return resolve_ip(host_or_ip)
    return resolve_hostname(host_or_ip)


def get_host_ip_scapy():
    ip = scapy.all.get_if_addr(scapy.all.conf.iface)
    if ip == '0.0.0.0':
        nics = scapy.all.conf.ifaces
        for nic in nics:
            ip = scapy.all.get_if_addr(nic)
            if ip not in ['127.0.0.1', '0.0.0.0']:
                break
    if ip == '0.0.0.0':
        ip = '127.0.0.1'
    return ip


def get_host_ip(host_or_ip='0.0.0.0'):
    if host_or_ip == '0.0.0.0':
        (hostname, ip) = resolve(gethostname())
        if ip == '127.0.0.1':
            (hostname, ip) = resolve(get_host_ip_scapy())
    else:
        (hostname, ip) = resolve(host_or_ip)
    return (hostname, ip)

if __name__ == '__main__':
    print(get_host_ip())