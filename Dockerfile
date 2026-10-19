FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV AITO_DATA_DIR=/data PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
