"""Campanha de um único dia. Probabilidades ficam exclusivamente no servidor."""
import secrets
from datetime import date
from ..models import current_brazil_time

CAMPANHA = date(2026, 9, 15)
PREMIOS = ('off5', 'off10', 'off15', 'frete', 'brinde')
PESOS = (50, 28, 12, 3, 7)
ROTULOS = ('5% OFF', '10% OFF', '15% OFF', 'Frete grátis', 'Brinde surpresa')

def ativa():
    return current_brazil_time().date() == CAMPANHA

def sortear():
    numero = secrets.randbelow(sum(PESOS))
    for premio, peso in zip(PREMIOS, PESOS):
        if numero < peso:
            return premio
        numero -= peso

def desconto(tipo, valor, base):
    return round(max(0, min(base, base * valor / 100 if tipo == 'percentual' else valor)), 2)

def escolher(premio, subtotal, base, frete, primeira=None, avaliacao=None,
             manual=0, aniversario=None):
    """Compara totais em centavos; nunca soma prêmio e benefícios nativos.

    Desconto de aniversário é comum às alternativas monetárias. O brinde
    acumula com os benefícios nativos e não precisa de avaliação monetária.
    """
    valor = round(manual, 2)
    origem = 'cupom' if manual else 'nenhum'
    if primeira:
        beneficio = desconto(*primeira, base)
        if beneficio > valor:
            valor, origem = beneficio, 'primeira_compra'
    review = desconto(*avaliacao, subtotal - valor) if avaliacao else 0
    valor += review
    if review and origem == 'nenhum':
        origem = 'avaliacao'
    if premio == 'brinde':
        bonus = desconto(*aniversario, subtotal - valor) if aniversario else 0
        return dict(origem='brinde', desconto=round(valor + bonus, 2),
                    avaliacao=review, cupom=origem == 'cupom', aniversario=bonus, frete=frete,
                    total=round(subtotal - valor - bonus + frete, 2))
    candidatos = [(origem, round(valor, 2), frete)]
    if premio.startswith('off'):
        candidatos.append(('roleta', desconto('percentual', int(premio[3:]), base), frete))
    elif premio == 'frete':
        candidatos.append(('roleta', 0, 0))
    resultados = []
    for origem, valor, taxa in candidatos:
        bonus = desconto(*aniversario, subtotal - valor) if aniversario else 0
        resultados.append(dict(origem=origem, desconto=round(valor + bonus, 2),
                               aniversario=bonus, frete=taxa,
                               total=round(subtotal - valor - bonus + taxa, 2)))
    melhor = min(resultados, key=lambda r: r['total'])
    melhor['cupom'] = melhor['origem'] == 'cupom'
    melhor['avaliacao'] = review if melhor['origem'] != 'roleta' else 0
    return melhor
