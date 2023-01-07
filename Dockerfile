FROM node:16 as base

WORKDIR /home/node/app

COPY package*.json ./

RUN npm i

COPY . .

RUN npx prisma generate

RUN npm run build

CMD node dist/index.js
