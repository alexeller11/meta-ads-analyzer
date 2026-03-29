FROM node:18

# Definir diretório de trabalho
WORKDIR /app

# Garantir que o diretório pertença ao usuário 'node' (UID 1000)
# Isso evita problemas de permissão no Hugging Face
RUN chown -R node:node /app

# Copiar arquivos de dependências primeiro (otimiza o cache do Docker)
COPY --chown=node:node package*.json ./

# Instalar dependências
RUN npm install

# Copiar o restante do código-fonte
COPY --chown=node:node . .

# Mudar para o usuário 'node' (que já tem UID 1000 nesta imagem)
USER node

# Expor a porta padrão do Railway
EXPOSE 3000

# Definir a porta como variável de ambiente para o Express
ENV PORT=3000
ENV NODE_ENV=production

# Comando para iniciar a aplicação
CMD ["npm", "start"]
