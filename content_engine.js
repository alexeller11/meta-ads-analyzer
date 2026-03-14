// ─── MOTOR DE PLANEJAMENTO DE CONTEUDO (sem API externa) ─────────────────────

function generateContentPlanEngine({ niche, businessName, igUsername, recentPosts, tone, audience }) {

  // ── Analisar posts existentes ─────────────────────────────────────────────
  const posts = recentPosts || [];
  let totalEng = 0, engCount = 0, bestFormat = 'POST', bestHour = '19h-21h';
  const formatStats = { IMAGE: { eng: 0, count: 0 }, VIDEO: { eng: 0, count: 0 }, CAROUSEL_ALBUM: { eng: 0, count: 0 } };

  posts.forEach(p => {
    const reach = p.reach || 1;
    const eng = ((p.like_count || 0) + (p.comments_count || 0)) / reach * 100;
    if (eng > 0) { totalEng += eng; engCount++; }
    const fmt = p.media_type || 'IMAGE';
    if (formatStats[fmt]) { formatStats[fmt].eng += eng; formatStats[fmt].count++; }
    // Detect best hour from timestamps
    if (p.timestamp) {
      const h = new Date(p.timestamp).getHours();
      if (h >= 18 && h <= 21) bestHour = '19h-21h';
      else if (h >= 11 && h <= 13) bestHour = '12h-13h';
    }
  });

  const avgEng = engCount > 0 ? (totalEng / engCount).toFixed(2) + '%' : 'N/A';

  // Determine best format from data
  let bestFmtScore = 0;
  Object.entries(formatStats).forEach(([fmt, s]) => {
    const avg = s.count > 0 ? s.eng / s.count : 0;
    if (avg > bestFmtScore) { bestFmtScore = avg; bestFormat = fmt === 'CAROUSEL_ALBUM' ? 'Carrossel' : fmt === 'VIDEO' ? 'Reels/Video' : 'Post de Imagem'; }
  });

  // ── Banco de ideias por nicho ─────────────────────────────────────────────
  const nicheLC = (niche || '').toLowerCase();
  const biz = businessName || igUsername || 'nossa empresa';

  // Detecta categoria do nicho
  const isConstrucao = /constru|material|obra|reforma|tinta|piso|cerami|arquitet/i.test(nicheLC);
  const isFood = /aliment|restaur|comida|lanche|hambur|pizza|cafe|padaria|delivery/i.test(nicheLC);
  const isSaude = /saude|clinica|medic|fisio|nutri|academia|treino|wellness/i.test(nicheLC);
  const isModa = /moda|roupa|vestuario|fashion|loja|boutique|atelie/i.test(nicheLC);
  const isServico = /servico|consultoria|agencia|marketing|contab|juridic|advocac/i.test(nicheLC);
  const isEdu = /curso|educacao|escola|ensino|aula|treinamento|capacitacao/i.test(nicheLC);
  const isBeleza = /beleza|salao|estetica|cabelo|unhas|make|cosmet/i.test(nicheLC);

  // Tom
  const toneMap = {
    profissional: { emoji1: '🔧', emoji2: '✅', emoji3: '📋', cta: 'Entre em contato', ctaLink: 'Link na bio' },
    descontraido: { emoji1: '😄', emoji2: '👋', emoji3: '🎉', cta: 'Conta pra gente', ctaLink: 'Acessa o link na bio' },
    inspirador: { emoji1: '✨', emoji2: '🚀', emoji3: '💡', cta: 'Transforme sua realidade', ctaLink: 'Saiba mais na bio' },
    educativo: { emoji1: '📚', emoji2: '💡', emoji3: '🎯', cta: 'Salva esse post', ctaLink: 'Mais conteúdo na bio' },
    vendas: { emoji1: '🔥', emoji2: '💰', emoji3: '⚡', cta: 'Aproveite agora', ctaLink: 'Compre pelo link na bio' }
  };
  const t = toneMap[tone] || toneMap['profissional'];

  // Hashtags base por nicho
  const hashBase = isConstrucao
    ? ['construção', 'reforma', 'materiaisdeconstrução', 'obra', 'arquitetura', 'engenharia', 'decoração', 'casa', 'design', 'projeto']
    : isFood
    ? ['gastronomia', 'foodie', 'comidaboa', 'restaurante', 'delivery', 'sabor', 'culinaria', 'alimentacao', 'foodlover', 'chef']
    : isSaude
    ? ['saude', 'bemestar', 'qualidadedevida', 'fitness', 'saudemental', 'medicina', 'prevencao', 'vidasaudavel', 'autocuidado', 'wellness']
    : isModa
    ? ['moda', 'fashion', 'estilo', 'lookdodia', 'tendencia', 'ootd', 'modafeminina', 'elegancia', 'looks', 'modabrasileira']
    : isServico
    ? ['negocios', 'empreendedorismo', 'marketing', 'resultados', 'sucesso', 'empresas', 'crescimento', 'estrategia', 'consultoria', 'pme']
    : isEdu
    ? ['educacao', 'aprendizado', 'curso', 'conhecimento', 'desenvolvimento', 'capacitacao', 'carreira', 'formacao', 'estudar', 'habilidades']
    : isBeleza
    ? ['beleza', 'autoestima', 'cabelo', 'make', 'estetica', 'bemestar', 'cuidados', 'belezafeminina', 'autoamor', 'transformacao']
    : ['negocio', 'empreendedorismo', 'qualidade', 'servico', 'brasil', 'empresa', 'inovacao', 'cliente', 'resultado', 'excelencia'];

  const nichoTag = niche.toLowerCase().replace(/\s+/g, '').slice(0, 20);
  const bizTag = biz.toLowerCase().replace(/\s+/g, '').slice(0, 20);
  const hashFull = [nichoTag, bizTag, ...hashBase].slice(0, 12);

  // ── Templates de conteúdo organizados por objetivo ───────────────────────
  // Estrutura: 12 posts, 8 carrosseis, 2 reels em 30 dias
  // Distribuição: semanas de conteúdo com progressão lógica

  const conteudos = [
    // SEMANA 1: Apresentação e Educação
    {
      dia: 1, tipo: 'POST', objetivo: 'relacionamento',
      titulo: `Boas-vindas — Quem somos nós`,
      gancho: `Você sabia que ${biz} já ajudou centenas de pessoas? ${t.emoji1}`,
      copy: `${t.emoji1} Bem-vindo(a) ao nosso perfil!\n\nSomos a ${biz} — especialistas em ${niche} com foco em resultados reais para você.\n\n${t.emoji2} Nossa missão: transformar sua experiência com ${niche} de forma simples e eficiente.\n\n${t.emoji3} ${t.cta}! ${t.ctaLink} 👇`,
      dica_visual: `Foto da equipe ou do espaço físico com identidade visual da marca`,
      melhor_horario: '19h-21h', hashtags: hashFull.slice(0,10)
    },
    {
      dia: 3, tipo: 'CARROSSEL', objetivo: 'educacao',
      titulo: `5 erros comuns em ${niche} e como evitar`,
      gancho: `❌ Você comete esses erros com ${niche}? (A maioria das pessoas comete)`,
      copy: `❌ Esses erros estão te custando tempo e dinheiro!\n\n👉 Deslize para ver os 5 erros mais comuns em ${niche} e como você pode evitar cada um deles.\n\n💾 Salva esse post — você vai querer consultar depois!\n\n${t.cta} se precisar de ajuda personalizada. ${t.ctaLink} 👇`,
      dica_visual: `Capa com título chamativo + 5 slides, cada um com um erro e a solução correspondente`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 5, tipo: 'POST', objetivo: 'engajamento',
      titulo: `Pergunta interativa sobre o nicho`,
      gancho: `Uma pergunta rápida para você ${t.emoji2} Qual dessas opções é a sua preferida?`,
      copy: `${t.emoji2} Precisamos da sua opinião!\n\nQuando o assunto é ${niche}, o que você valoriza mais?\n\nA) Qualidade\nB) Preço\nC) Agilidade\nD) Atendimento\n\n💬 Comenta aqui embaixo a sua resposta! Vamos ver qual é a mais votada 👇`,
      dica_visual: `Arte gráfica colorida com enquete visual ou imagem relacionada ao nicho`,
      melhor_horario: '19h-21h', hashtags: hashFull.slice(0,9)
    },
    {
      dia: 7, tipo: 'CARROSSEL', objetivo: 'educacao',
      titulo: `Guia completo: Como funciona ${niche}`,
      gancho: `📖 Guia completo sobre ${niche} — tudo que você precisa saber`,
      copy: `📖 Tudo que você precisa saber sobre ${niche} em um só lugar!\n\n👉 Deslize para o guia completo que preparamos especialmente para você.\n\nEsse conteúdo vai te ajudar a tomar decisões melhores e economizar dinheiro!\n\n💾 Salva e compartilha com quem precisa! ${t.ctaLink} 👇`,
      dica_visual: `Série de slides informativos com ícones, dados e dicas práticas sobre o nicho`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    // SEMANA 2: Prova Social e Autoridade
    {
      dia: 9, tipo: 'POST', objetivo: 'engajamento',
      titulo: `Depoimento de cliente ou caso de sucesso`,
      gancho: `⭐ "Melhor decisão que tomei" — veja o que nossos clientes dizem`,
      copy: `⭐⭐⭐⭐⭐ O que nossos clientes dizem sobre a ${biz}:\n\n"[Depoimento do cliente aqui — peça autorização e insira a fala real]"\n\n${t.emoji1} Resultados reais, clientes satisfeitos. Esse é o nosso compromisso!\n\n${t.emoji3} Quer ser o próximo? ${t.cta}! ${t.ctaLink} 👇`,
      dica_visual: `Foto do cliente (com autorização) ou print do depoimento com identidade visual`,
      melhor_horario: '19h-21h', hashtags: [...hashFull.slice(0,7), 'depoimento', 'clientesatisfeito', 'resultados']
    },
    {
      dia: 11, tipo: 'REEL', objetivo: 'alcance',
      titulo: `Bastidores da empresa — como trabalhamos`,
      gancho: `🎬 Você nunca viu como funciona por trás das cenas da ${biz}`,
      copy: `🎬 Vem ver como fazemos acontecer!\n\nBastidores da ${biz} — processo, dedicação e muito cuidado em cada detalhe para entregar o melhor em ${niche}.\n\n${t.emoji2} Compartilha com alguém que precisaria conhecer nosso trabalho!\n\n${t.ctaLink} para saber mais 👇`,
      dica_visual: `Video dinâmico de 15-30s mostrando o dia a dia, processo de trabalho ou produto sendo feito`,
      melhor_horario: '20h-22h', hashtags: [...hashFull.slice(0,8), 'bastidores', 'detras das cenas', 'processo']
    },
    {
      dia: 13, tipo: 'CARROSSEL', objetivo: 'educacao',
      titulo: `Comparativo: antes x depois / certo x errado`,
      gancho: `🔴 vs 🟢 A diferença entre fazer certo e errado em ${niche}`,
      copy: `🔴 vs 🟢 Você sabe qual a diferença?\n\n👉 Deslize para ver as comparações que vão mudar sua visão sobre ${niche}.\n\nEssa é a diferença entre resultados mediocres e resultados incríveis!\n\n${t.emoji2} ${t.cta} para fazer parte do grupo que faz certo! ${t.ctaLink} 👇`,
      dica_visual: `Slides com comparações visuais lado a lado — situação incorreta vs situação correta`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 15, tipo: 'POST', objetivo: 'conversao',
      titulo: `Oferta especial ou serviço em destaque`,
      gancho: `🔥 Oportunidade especial da ${biz} — por tempo limitado!`,
      copy: `🔥 Aproveite essa oportunidade!\n\n${t.emoji1} [Descreva seu produto/serviço principal e o benefício mais importante]\n\n✅ [Benefício 1]\n✅ [Benefício 2]\n✅ [Benefício 3]\n\n${t.emoji3} ${t.cta} agora! ${t.ctaLink} 👇`,
      dica_visual: `Arte profissional com destaque visual para a oferta, preço ou benefício principal`,
      melhor_horario: '19h-21h', hashtags: [...hashFull.slice(0,8), 'oferta', 'promocao', 'oportunidade']
    },
    // SEMANA 3: Conteúdo Educativo Aprofundado
    {
      dia: 17, tipo: 'CARROSSEL', objetivo: 'educacao',
      titulo: `Passo a passo: como resolver problema comum do nicho`,
      gancho: `✅ Passo a passo completo para resolver [problema comum] de uma vez por todas`,
      copy: `✅ Chega de sofrimento com [problema comum em ${niche}]!\n\nCriamos um passo a passo simples e direto para você resolver isso hoje mesmo.\n\n👉 Deslize e siga cada etapa na ordem.\n\n💾 Salva esse conteúdo — você vai usar várias vezes! ${t.ctaLink} 👇`,
      dica_visual: `Série de slides numerados com passo a passo visual, ícones e cores da marca`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 19, tipo: 'POST', objetivo: 'relacionamento',
      titulo: `Curiosidade ou fato surpreendente do nicho`,
      gancho: `🤯 Você sabia dessa curiosidade sobre ${niche}? (A maioria não sabe)`,
      copy: `🤯 Curiosidade sobre ${niche} que vai te surpreender:\n\n[Insira dado ou fato interessante e verdadeiro sobre seu nicho]\n\n${t.emoji2} Interessante, né? Conta pra gente — você já sabia disso?\n\n💬 Comenta aqui embaixo! A gente lê tudo 👇`,
      dica_visual: `Arte gráfica com o fato/curiosidade em destaque visual, fundo colorido`,
      melhor_horario: '19h-21h', hashtags: hashFull.slice(0,10)
    },
    {
      dia: 21, tipo: 'CARROSSEL', objetivo: 'engajamento',
      titulo: `${5} dicas rápidas e práticas sobre ${niche}`,
      gancho: `${t.emoji1} 5 dicas que especialistas em ${niche} usam todo dia`,
      copy: `${t.emoji1} Dicas que fazem toda a diferença!\n\n👉 Deslize para as 5 dicas que profissionais de ${niche} usam para ter resultados superiores.\n\nSão simples, práticas e você pode aplicar hoje mesmo!\n\n💾 Salva para consultar quando precisar! ${t.ctaLink} para saber mais 👇`,
      dica_visual: `Capa chamativa + 5 slides com uma dica por slide, design limpo e direto`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 23, tipo: 'POST', objetivo: 'conversao',
      titulo: `Proposta de valor — por que nos escolher`,
      gancho: `💡 Por que centenas de clientes escolhem a ${biz} para ${niche}?`,
      copy: `💡 O que nos diferencia:\n\n${t.emoji1} [Diferencial 1 da sua empresa]\n${t.emoji2} [Diferencial 2 da sua empresa]\n${t.emoji3} [Diferencial 3 da sua empresa]\n\nNão é só palavra — é resultado comprovado por nossos clientes!\n\n${t.cta} e experimente a diferença. ${t.ctaLink} 👇`,
      dica_visual: `Arte com diferenciais listados visualmente, foto da empresa ou produto de destaque`,
      melhor_horario: '19h-21h', hashtags: [...hashFull.slice(0,8), 'diferenciais', 'qualidade', 'escolha']
    },
    // SEMANA 4: Engajamento e Fechamento do Mês
    {
      dia: 24, tipo: 'CARROSSEL', objetivo: 'educacao',
      titulo: `Mitos e verdades sobre ${niche}`,
      gancho: `🔍 Mitos e verdades sobre ${niche} — você acredita em qual desses?`,
      copy: `🔍 Vamos separar o mito da verdade!\n\nExistem muitas informações erradas sobre ${niche} por aí. Preparamos esse guia para você não cair em armadilhas.\n\n👉 Deslize e descubra o que é verdade e o que é mentira.\n\n💬 Comenta qual mito te surpreendeu mais! ${t.ctaLink} 👇`,
      dica_visual: `Slides com "MITO ❌" vs "VERDADE ✅" em design contrastante e chamativo`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 25, tipo: 'POST', objetivo: 'relacionamento',
      titulo: `Conteúdo de valor humano — história ou propósito`,
      gancho: `${t.emoji2} A história por trás da ${biz} que poucos conhecem`,
      copy: `${t.emoji2} Toda empresa tem uma história...\n\nA ${biz} nasceu de um sonho: [conte brevemente a origem ou propósito da empresa de forma pessoal e autêntica].\n\nHoje, cada cliente atendido nos lembra por que começamos.\n\n${t.emoji1} Obrigado por fazer parte dessa história! 💙`,
      dica_visual: `Foto autêntica e humanizada — fundador, equipe ou momento especial da empresa`,
      melhor_horario: '19h-21h', hashtags: [...hashFull.slice(0,7), 'historia', 'proposito', 'valores']
    },
    {
      dia: 26, tipo: 'CARROSSEL', objetivo: 'conversao',
      titulo: `Como contratar / Como funciona nosso processo`,
      gancho: `📋 Como é fácil trabalhar com a ${biz} — veja o processo completo`,
      copy: `📋 Transparência é tudo!\n\nVeja como é simples trabalhar com a ${biz}:\n\n👉 Deslize e conheça cada etapa do nosso processo.\n\nSem surpresas, sem complicação. Só resultado!\n\n${t.emoji3} Pronto para começar? ${t.cta}! ${t.ctaLink} 👇`,
      dica_visual: `Fluxo visual do processo em etapas numeradas, com ícones e cores da marca`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 27, tipo: 'POST', objetivo: 'engajamento',
      titulo: `Repost ou destaque de comentário de cliente`,
      gancho: `💬 Isso aqui nos deixou muito felizes! Obrigado, [nome do cliente]`,
      copy: `💬 Nada melhor que começar o dia com uma mensagem dessas!\n\n[Insira o depoimento ou comentário real de cliente — com autorização]\n\nÉ por isso que fazemos o que fazemos. ${t.emoji1}\n\nSe você também já foi atendido por nós, conta a sua experiência nos comentários! 👇`,
      dica_visual: `Print estilizado do comentário com identidade visual da marca ou foto do cliente`,
      melhor_horario: '19h-21h', hashtags: [...hashFull.slice(0,7), 'feedback', 'obrigado', 'gratidao']
    },
    {
      dia: 28, tipo: 'CARROSSEL', objetivo: 'educacao',
      titulo: `Resumo do mês — conteúdos mais salvos`,
      gancho: `📌 Os conteúdos mais salvos do mês — você viu todos?`,
      copy: `📌 Você perdeu algum?\n\nEsse mês trouxemos muito conteúdo sobre ${niche} para você!\n\n👉 Deslize para ver um resumo dos conteúdos mais salvos e compartilhados.\n\n💾 Salva esse carrossel para ter tudo em um lugar só!\n\nNo próximo mês tem muito mais. ${t.ctaLink} para não perder nada 👇`,
      dica_visual: `Compilação dos melhores frames/artes do mês em formato de retrospectiva`,
      melhor_horario: '12h-13h', hashtags: hashFull
    },
    {
      dia: 29, tipo: 'POST', objetivo: 'conversao',
      titulo: `CTA direto — promoção ou contato final do mês`,
      gancho: `⚡ Últimos dias para aproveitar — não perca essa oportunidade!`,
      copy: `⚡ Última chamada!\n\n${t.emoji1} [Descreva produto, serviço ou promoção com prazo]\n\n✅ [Benefício principal]\n✅ [Condição especial]\n✅ [Garantia ou diferencial]\n\n${t.emoji3} ${t.cta} agora e garanta o seu! ${t.ctaLink} 👇\n\nEstamos esperando você!`,
      dica_visual: `Arte com urgência visual — contador, prazo ou destaque de oferta`,
      melhor_horario: '19h-21h', hashtags: [...hashFull.slice(0,8), 'ultimosdias', 'aproveite', 'naopreca']
    },
    {
      dia: 30, tipo: 'REEL', objetivo: 'alcance',
      titulo: `Reel de encerramento — impacto e próximo mês`,
      gancho: `🚀 Um mês incrível! E o próximo vai ser ainda melhor`,
      copy: `🚀 Que mês incrível foi esse!\n\nObrigado por acompanhar a ${biz} em mais um mês cheio de conteúdo sobre ${niche}.\n\n${t.emoji2} Se você gostou, compartilha esse reel com alguém que precisa ver isso!\n\nO próximo mês vem com novidades. Ativa o sino 🔔 para não perder nada!\n\n${t.ctaLink} 👇`,
      dica_visual: `Video compilação com os melhores momentos/conteúdos do mês, música animada, texto na tela`,
      melhor_horario: '20h-22h', hashtags: [...hashFull.slice(0,8), 'encerramento', 'obrigado', 'proximomes']
    },
    // Conteúdos extras distribuídos
    {
      dia: 8, tipo: 'POST', objetivo: 'engajamento',
      titulo: `Tip rápida — dica do dia sobre o nicho`,
      gancho: `${t.emoji3} Dica rápida de ${niche} que você pode usar hoje mesmo!`,
      copy: `${t.emoji3} Dica do dia!\n\n[Insira uma dica prática, simples e relevante sobre seu nicho]\n\nParece simples, mas faz uma diferença enorme no resultado final!\n\n${t.emoji2} Compartilha com alguém que precisa dessa dica! 👇`,
      dica_visual: `Arte limpa com a dica em destaque, ícone relacionado ao nicho`,
      melhor_horario: '08h-09h', hashtags: hashFull.slice(0,9)
    },
    {
      dia: 14, tipo: 'POST', objetivo: 'relacionamento',
      titulo: `Conteúdo interativo — votação ou escolha`,
      gancho: `🗳️ Vote aqui: qual você prefere? A ou B?`,
      copy: `🗳️ Precisamos da sua ajuda para decidir!\n\nA) [Opção relacionada ao seu nicho]\nB) [Outra opção]\n\n💬 Comenta A ou B aqui nos comentários!\n\nVamos ver qual ganha mais votos. Respondo todo mundo que comentar 😊\n\nSua opinião é muito importante para nós! ${t.emoji1}`,
      dica_visual: `Arte com as duas opções em destaque visual, cores contrastantes para A e B`,
      melhor_horario: '12h-13h', hashtags: hashFull.slice(0,9)
    },
    {
      dia: 20, tipo: 'POST', objetivo: 'educacao',
      titulo: `Infográfico ou dado relevante do nicho`,
      gancho: `📊 Dado sobre ${niche} que vai te surpreender!`,
      copy: `📊 Você conhecia esses números?\n\n[Insira dado, pesquisa ou estatística relevante e verdadeira do seu nicho]\n\nEsses dados mostram exatamente por que ${niche} é tão importante!\n\n${t.emoji1} Compartilha essa informação — muita gente não sabe disso ainda! 👇`,
      dica_visual: `Infográfico simples com o dado em destaque, fonte citada, design profissional`,
      melhor_horario: '19h-21h', hashtags: hashFull.slice(0,10)
    },
    {
      dia: 22, tipo: 'CARROSSEL', objetivo: 'engajamento',
      titulo: `Checklist prático para o público`,
      gancho: `✅ Checklist: você está fazendo tudo certo com ${niche}?`,
      copy: `✅ Esse checklist vai te mostrar onde você está no caminho certo — e onde precisa melhorar!\n\n👉 Deslize e veja cada item.\n\n💾 Salva para usar como referência!\n\n${t.emoji2} Quantos itens você já faz? Conta nos comentários! ${t.ctaLink} 👇`,
      dica_visual: `Série de slides com checklist visual — ✅ para itens bons, ❌ para alertas`,
      melhor_horario: '12h-13h', hashtags: hashFull
    }
  ];

  // Ordenar por dia
  conteudos.sort((a, b) => a.dia - b.dia);

  // ── Análise da conta ──────────────────────────────────────────────────────
  const hasPosts = posts.length > 0;
  const pontosFortes = [];
  const pontosMelhoria = [];

  if (hasPosts) {
    const hasCarrossel = posts.some(p => p.media_type === 'CAROUSEL_ALBUM');
    const hasVideo = posts.some(p => p.media_type === 'VIDEO');
    const avgEngNum = parseFloat(avgEng) || 0;

    if (hasCarrossel) pontosFortes.push('Já usa carrosseis — formato de maior salvamento');
    if (hasVideo) pontosFortes.push('Usa vídeos — aumenta alcance orgânico');
    if (avgEngNum >= 3) pontosFortes.push(`Taxa de engajamento de ${avgEng} — acima da média`);
    if (posts.length >= 15) pontosFortes.push('Consistência no perfil — mais de 15 posts recentes');
    if (!hasCarrossel) pontosMelhoria.push('Incluir carrosseis — geram 3x mais salvamentos que fotos');
    if (!hasVideo) pontosMelhoria.push('Publicar Reels — algoritmo prioriza formato de vídeo');
    if (avgEngNum < 2) pontosMelhoria.push('Engajamento pode melhorar com CTAs mais diretos nos posts');
    if (posts.length < 8) pontosMelhoria.push('Aumentar frequência de publicação — ideal 4-5x por semana');
  } else {
    pontosFortes.push('Perfil pronto para iniciar estratégia de conteúdo');
    pontosMelhoria.push('Publicar consistentemente — ideal 4-5x por semana');
    pontosMelhoria.push('Começar com carrosseis educativos para construir autoridade');
    pontosMelhoria.push('Usar Reels desde o início para ganhar alcance orgânico rápido');
  }

  if (pontosFortes.length === 0) pontosFortes.push('Potencial de crescimento identificado com estratégia correta');

  // Tendências por nicho
  const tendencias = isConstrucao
    ? ['construcaosustentavel', 'casamoderna', 'decoracaominimalista', 'reformaeconomica', 'autoconstrucao']
    : isFood
    ? ['comidaartesanal', 'delivery', 'gastronomiasustentavel', 'alimentacaosaudavel', 'receitarapida']
    : isSaude
    ? ['saudemental', 'mindfulness', 'prevencao', 'medicinapreventiva', 'bemestarintegrativo']
    : isModa
    ? ['modaconsciente', 'slowfashion', 'lookdodia', 'tendencias2025', 'modainclusive']
    : isServico
    ? ['transformacaodigital', 'inteligenciaartificial', 'automacao', 'escalabilidade', 'resultadosmensuráveis']
    : isEdu
    ? ['aprendizagemonline', 'microlearning', 'educacaohibrida', 'certificacoes', 'upskilling']
    : isBeleza
    ? ['belezanatural', 'skincare', 'autocuidado', 'belezainclusiva', 'tendenciasbeleza']
    : ['inovacao', 'transformacaodigital', 'sustentabilidade', 'experienciadocliente', 'tendencias2025'];

  return {
    analise: {
      pontos_fortes: pontosFortes,
      pontos_melhoria: pontosMelhoria,
      melhor_formato: bestFormat,
      melhor_horario: bestHour,
      taxa_engajamento_media: avgEng
    },
    tendencias,
    plano: conteudos
  };
}

module.exports = { generateContentPlanEngine };
