FROM oven/bun

WORKDIR /app

COPY package.json .
COPY bun.lock .
COPY .env .
ENV NODE_ENV production

RUN apt-get update && apt-get install -y git

RUN bun install --production

COPY src src
COPY tsconfig.json .

RUN git clone --depth 1 https://github.com/diangogav/evolution-types.git ./src/evolution-types

CMD ["bun", "src/index.ts"]

EXPOSE 3000
