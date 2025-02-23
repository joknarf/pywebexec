import ipaddress
import netifaces
from socket import gethostname, gethostbyname_ex, gethostbyaddr, inet_aton, inet_ntoa, AF_INET, SOCK_STREAM

def resolve_hostname(host):
    """try get fqdn from DNS/hosts"""
    try:
        hostinfo = gethostbyname_ex(host)
        for ip in hostinfo[2]:
            if not ip.startswith('127.') or host in ('localhost', 'localhost.localdomain'):
                return (hostinfo[0].rstrip('.'), ip)
        return (host, host)
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


def get_default_gateway_ip():
    gateways = netifaces.gateways()
    default = gateways.get('default', {}).get(netifaces.AF_INET)
    if default:
        return default[0]
    gateways = gateways.get(netifaces.AF_INET)
    if gateways:
        return gateways[0][0]
    return None

def get_primary_ip():
    """try to get primary ip address 
    first ip address in the same network as default gateway"""
    default_gateway_ip = get_default_gateway_ip()
    if default_gateway_ip:
        default_ip = ipaddress.ip_address(default_gateway_ip)
    for iface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(iface)
        if netifaces.AF_INET in addrs:
            for addr in addrs[netifaces.AF_INET]:
                iface_ip = addr.get('addr')
                iface_netmask = addr.get('netmask')
                if iface_ip and iface_netmask:
                    if not default_gateway_ip:
                        return iface_ip
                    try:
                        network = ipaddress.ip_network(f"{iface_ip}/{iface_netmask}", strict=False)
                    except Exception:
                        continue
                    if default_ip in network:
                        return iface_ip
    return '127.0.0.1'


def get_host_ip(host_or_ip='0.0.0.0'):
    if host_or_ip == '0.0.0.0':
        (hostname, ip) = resolve(gethostname())
        if ip == '127.0.0.1':
            (hostname, ip) = resolve(get_primary_ip())
    else:
        (hostname, ip) = resolve(host_or_ip)
    return (hostname, ip)

if __name__ == '__main__':
    print(get_host_ip())