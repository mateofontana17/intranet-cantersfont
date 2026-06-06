#!/usr/bin/env node
/**
 * Genera todos los workflows del proyecto ficha-stock.
 */
console.log('Generando workflows de ficha-stock...\n');

require('./generate-calculo-materiales');
require('./generate-alerta-stock');
require('./generate-reporte-programado');
require('./generate-telegram-bot');
require('./generate-formulario-webhook');

console.log('\nTodos los workflows generados.');
