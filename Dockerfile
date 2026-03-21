FROM node:18

# Criar usuário não-root conforme recomendado pelo Hugging Face Spaces
RUN useradd -m -u 1000 user

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json (se existir)
COPY --chown=user package*.json ./

# Instalar dependências
RUN npm install

# Copiar o restante do código
COPY --chown=user . .

# Mudar para o usuário não-root
USER user

# Expor a porta que o Hugging Face Spaces usa por padrão
EXPOSE 7860

# Definir a porta como variável de ambiente para o Express
ENV PORT=7860

# Comando para iniciar a aplicação
CMD ["npm", "start"]
