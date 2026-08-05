FROM node:24-alpine
WORKDIR /app

# Required MCP registry OCI ownership label
LABEL io.modelcontextprotocol.server.name="io.github.figranium/figranium-mcp"

# Copy dependency manifests
COPY package*.json ./

# Install ALL dependencies (including typescript)
RUN npm ci

# Copy remaining source code and build
COPY . .
RUN npm run build --if-present

# Prune devDependencies to keep image size minimal
RUN npm prune --production

CMD ["node", "dist/index.js"]
