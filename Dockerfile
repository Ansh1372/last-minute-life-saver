FROM node:22-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose the port (Cloud Run defaults to 8080, but we can configure it)
EXPOSE 3001

# Cloud Run sets the PORT environment variable. We should pass it or use our default.
# Our server.ts defaults to 3001. We should update server.ts to use process.env.PORT || 3001,
# but for now, we will just tell Cloud Run to use 3001 via Docker.
CMD ["npm", "start"]
