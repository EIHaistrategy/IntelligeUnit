FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# DEMO_DATA=1: all'avvio si carica il percorso guidato DEMO (dati separati dalla Produzione), così dopo ogni riavvio è pronto.
# Per non caricarlo: variabile DEMO_DATA=0 nelle impostazioni del servizio.
ENV AITO_DATA_DIR=/data PORT=3000 NODE_ENV=production DEMO_DATA=1
EXPOSE 3000
CMD ["npm", "start"]
