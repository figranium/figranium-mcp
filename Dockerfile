FROM node:24-alpine
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install ALL dependencies (including typescript)
RUN npm ci

# Copy remaining source code and build
COPY . .
RUN npm run build --if-present

# Prune devDependencies to keep the image small
RUN npm prune --production

CMD ["node", "dist/index.js"]
