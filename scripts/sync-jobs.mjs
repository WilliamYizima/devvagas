#!/usr/bin/env node
// scripts/sync-jobs.mjs
// Fetches GitHub Issues labeled 'vaga' and writes src/data/jobs.json
// Usage: node scripts/sync-jobs.mjs
//        REPO_OWNER=foo REPO_NAME=bar node scripts/sync-jobs.mjs

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const REPO_OWNER = process.env.REPO_OWNER || 'WilliamYizima';
const REPO_NAME = process.env.REPO_NAME || 'devvagas';
const VAGA_LABEL = 'vaga';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

// ── Parsing helpers (mirrored from src/lib/github.ts) ──────────────────────

function field(body, ...keys) {
    for (const key of keys) {
        const re = new RegExp(`###\\s*${key}\\s*\\n([^\\n#]+)`, 'i');
        const m = body.match(re);
        if (m) return m[1].trim();
    }
    return '';
}

function textareaField(body, key) {
    const re = new RegExp(`###\\s*${key}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i');
    const m = body.match(re);
    return m ? normalizeDescricao(m[1].trim()) : '';
}

const SECTION_HEADER_RE = /^(sobre|responsabilidade|requisito|benefício|beneficio|qualificaç|qualificac|habilidade|diferencial|o que\b|por que\b|quem somos|cultura|missão|missao|perfil|atividade|experiência|experiencia|vantagem)/i;

/** @param {string} raw */
function normalizeDescricao(raw) {
    if (!raw) return '';
    // Já tem markdown → retorna como está
    if (/^###\s/m.test(raw)) return raw;

    const lines = raw.split(/\r?\n/);
    const result = [];
    let inSection = false;

    for (const line of lines) {
        const t = line.trim();
        if (!t) { result.push(''); continue; }
        if (SECTION_HEADER_RE.test(t)) {
            result.push(`### ${t}`);
            inSection = true;
        } else if (inSection) {
            result.push(`- ${t}`);
        } else {
            result.push(t);
        }
    }
    return result.join('\n');
}

function toSlug(title) {
    return title.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function parseIssue(issue) {
    const body = issue.body ?? '';
    const tipo = field(body, 'Tipo', 'Modelo de Trabalho', 'Regime');
    const local = field(body, 'Localização', 'Local', 'Cidade');
    const stackRaw = field(body, 'Stack', 'Tecnologias', 'Skills');
    const stack = stackRaw ? stackRaw.split(/[,;/]/).map(s => s.trim()).filter(Boolean).slice(0, 8) : [];
    const isRemote = /remot/i.test(tipo) || /remot/i.test(local) || issue.labels.some(l => /remot/i.test(l.name));
    const isLinkedin = /sim/i.test(field(body, 'Publicada no LinkedIn', 'LinkedIn'));
    const isInternacional = /sim/i.test(field(body, 'Vaga Internacional', 'Internacional'));
    const cleanTitle = issue.title.replace(/^\[VAGA\]\s*/i, '').trim();

    return {
        id: issue.number,
        title: cleanTitle,
        body,
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        author: { login: issue.user.login, avatar: issue.user.avatar_url, url: issue.user.html_url },
        labels: issue.labels.map(l => l.name).filter(n => n !== VAGA_LABEL),
        empresa: field(body, 'Empresa'),
        nivel: field(body, 'Nível', 'Senioridade'),
        tipo,
        local,
        salario: field(body, 'Salário', 'Remuneração', 'Faixa Salarial'),
        stack,
        descricao: textareaField(body, 'Descrição da Vaga'),
        aplicar: field(body, 'Como se candidatar', 'Aplicar', 'Link'),
        isRemote,
        isLinkedin,
        isInternacional,
        slug: toSlug(cleanTitle),
    };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function fetchPage(page) {
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`;

    const url =
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues` +
        `?labels=${VAGA_LABEL}&state=open&per_page=100&page=${page}&sort=created&direction=desc`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return res.json();
}

async function main() {
    console.log(`Syncing jobs from ${REPO_OWNER}/${REPO_NAME}...`);

    let allIssues = [];
    let page = 1;

    while (true) {
        const issues = await fetchPage(page);
        allIssues = allIssues.concat(issues);
        if (issues.length < 100) break;
        page++;
    }

    const jobs = allIssues.map(parseIssue);

    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const outPath = join(root, 'src', 'data', 'jobs.json');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(jobs, null, 2) + '\n');

    console.log(`✅ ${jobs.length} vaga(s) salvas em src/data/jobs.json`);
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
