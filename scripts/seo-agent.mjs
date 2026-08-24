#!/usr/bin/env node
// scripts/seo-agent.mjs
// SEO audit + sitemap auto-fix for gainfully.app
// Ingen npm dependencies -- kun Node.js built-ins

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE_URL = 'https://gainfully.app'

const PAGES = [
  { file: 'index.html',                    url: '/',                                  lang: 'da',    priority: 1.0 },
  { file: 'en/index.html',                 url: '/en/',                               lang: 'en',    priority: 0.9 },
  { file: 'de/index.html',                 url: '/de/',                               lang: 'de',    priority: 0.9 },
  { file: 'fr/index.html',                 url: '/fr/',                               lang: 'fr',    priority: 0.9 },
  { file: 'es/index.html',                 url: '/es/',                               lang: 'es',    priority: 0.9 },
  { file: 'pt-br/index.html',              url: '/pt-br/',                            lang: 'pt-BR', priority: 0.9 },
  { file: 'ai-traeningsforloeb.html',      url: '/ai-traeningsforloeb.html',          lang: 'da',    priority: 0.8 },
  { file: 'ai-personlig-traener.html',    url: '/ai-personlig-traener.html',         lang: 'da',    priority: 0.8 },
  { file: 'ai-workout-plan.html',          url: '/ai-workout-plan.html',              lang: 'en',    priority: 0.8 },
  { file: 'ki-trainingsplan.html',         url: '/ki-trainingsplan.html',             lang: 'de',    priority: 0.8 },
  { file: 'programme-musculation-ia.html', url: '/programme-musculation-ia.html',     lang: 'fr',    priority: 0.8 },
  { file: 'plan-entrenamiento-ia.html',    url: '/plan-entrenamiento-ia.html',        lang: 'es',    priority: 0.8 },
  { file: 'plano-treino-ia.html',          url: '/plano-treino-ia.html',              lang: 'pt-BR', priority: 0.8 },
  { file: 'privacy.html',                  url: '/privacy.html',                      lang: 'en',    priority: 0.3 },
  { file: 'terms.html',                    url: '/terms.html',                        lang: 'en',    priority: 0.3 },
]

// Extraherer en tag-attribut korrekt for baade double- og single-quoted vaerdier.
// Bruger separate regexes per quote-type for at undgaa at stoppe ved apostrofer i content.
function extractMeta(html, nameAttr, nameVal) {
  const patterns = [
    new RegExp(`<meta\\s[^>]*${nameAttr}="${nameVal}"[^>]*content="([^"]*)"`, 'i'),
    new RegExp(`<meta\\s[^>]*content="([^"]*)"[^>]*${nameAttr}="${nameVal}"`, 'i'),
    new RegExp(`<meta\\s[^>]*${nameAttr}='${nameVal}'[^>]*content='([^']*)'`, 'i'),
    new RegExp(`<meta\\s[^>]*content='([^']*)'[^>]*${nameAttr}='${nameVal}'`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1].trim()
  }
  return null
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim() : null
}

function extractCanonical(html) {
  const m =
    html.match(/<link\s[^>]*rel="canonical"[^>]*href="([^"]+)"/i) ||
    html.match(/<link\s[^>]*href="([^"]+)"[^>]*rel="canonical"/i)
  return m ? m[1].trim() : null
}

function extractHtmlLang(html) {
  const m = html.match(/<html\s[^>]*lang="([^"]+)"/i) || html.match(/<html\s[^>]*lang='([^']+)'/i)
  return m ? m[1].trim() : null
}

function auditPage(page) {
  const filepath = path.join(ROOT, page.file)
  const issues = []

  if (!fs.existsSync(filepath)) {
    return { page, exists: false, score: 0, issues: [{ level: 'critical', msg: 'Fil ikke fundet' }] }
  }

  const html = fs.readFileSync(filepath, 'utf-8')
  let score = 100

  // --- Title ---
  const title = extractTitle(html)
  if (!title) {
    issues.push({ level: 'critical', msg: '<title> mangler' })
    score -= 20
  } else if (title.length < 30) {
    issues.push({ level: 'warn', msg: `Title for kort: ${title.length} tegn (min 30)` })
    score -= 5
  } else if (title.length > 65) {
    issues.push({ level: 'warn', msg: `Title for lang: ${title.length} tegn (max 65)` })
    score -= 5
  }

  // --- Meta description ---
  const desc = extractMeta(html, 'name', 'description')
  if (!desc) {
    issues.push({ level: 'critical', msg: 'meta description mangler' })
    score -= 15
  } else if (desc.length < 80) {
    issues.push({ level: 'warn', msg: `Description for kort: ${desc.length} tegn (min 80)` })
    score -= 5
  } else if (desc.length > 165) {
    issues.push({ level: 'warn', msg: `Description for lang: ${desc.length} tegn (max 165)` })
    score -= 3
  }

  // --- Canonical ---
  const canonical = extractCanonical(html)
  if (!canonical) {
    issues.push({ level: 'critical', msg: 'canonical URL mangler' })
    score -= 15
  } else if (!canonical.startsWith(BASE_URL)) {
    issues.push({ level: 'warn', msg: `canonical peger vaek fra ${BASE_URL}: ${canonical}` })
    score -= 5
  }

  // --- H1 ---
  const h1count = (html.match(/<h1[\s>]/gi) || []).length
  if (h1count === 0) {
    issues.push({ level: 'critical', msg: 'Ingen <h1> tag' })
    score -= 10
  } else if (h1count > 1) {
    issues.push({ level: 'warn', msg: `${h1count} <h1> tags fundet -- skal vaere præcis 1` })
    score -= 5
  }

  // --- HTML lang ---
  const htmlLang = extractHtmlLang(html)
  if (!htmlLang) {
    issues.push({ level: 'warn', msg: '<html lang="..."> mangler' })
    score -= 3
  } else if (htmlLang.toLowerCase() !== page.lang.toLowerCase()) {
    issues.push({ level: 'warn', msg: `lang="${htmlLang}" men forventet "${page.lang}"` })
    score -= 3
  }

  // --- Open Graph ---
  const ogTitle = extractMeta(html, 'property', 'og:title')
  if (!ogTitle) {
    issues.push({ level: 'warn', msg: 'og:title mangler (social sharing)' })
    score -= 5
  }

  const ogDesc = extractMeta(html, 'property', 'og:description')
  if (!ogDesc) {
    issues.push({ level: 'warn', msg: 'og:description mangler' })
    score -= 3
  }

  const ogImage = extractMeta(html, 'property', 'og:image')
  if (!ogImage) {
    issues.push({ level: 'warn', msg: 'og:image mangler' })
    score -= 3
  }

  // --- Schema.org (vigtig for SEO-landingssider) ---
  if (!html.includes('application/ld+json') && page.priority >= 0.8) {
    issues.push({ level: 'warn', msg: 'Ingen JSON-LD structured data (vigtigt for SEO-landingssider)' })
    score -= 5
  }

  // --- Viewport ---
  if (!html.includes('name="viewport"')) {
    issues.push({ level: 'warn', msg: 'viewport meta tag mangler' })
    score -= 3
  }

  // --- Billeder uden alt ---
  const imgTags = html.match(/<img[^>]+>/gi) || []
  const missingAlt = imgTags.filter(img => !img.match(/\balt=["'][^"']*["']/i))
  if (missingAlt.length > 0) {
    issues.push({ level: 'warn', msg: `${missingAlt.length} billede(r) mangler alt-attribut` })
    score -= Math.min(missingAlt.length * 2, 10)
  }

  return {
    page,
    exists: true,
    title: title || null,
    desc: desc ? `${desc.length} tegn` : null,
    canonical: canonical || null,
    h1count,
    issues,
    score: Math.max(0, score),
  }
}

function updateSitemap(results) {
  const sitemapPath = path.join(ROOT, 'sitemap.xml')
  if (!fs.existsSync(sitemapPath)) return { changed: false, updates: [] }

  let xml = fs.readFileSync(sitemapPath, 'utf-8')
  let changed = false
  const updates = []

  for (const r of results) {
    if (!r.exists) continue
    const filepath = path.join(ROOT, r.page.file)
    const fileDate = fs.statSync(filepath).mtime.toISOString().split('T')[0]
    const fullUrl = BASE_URL + r.page.url
    const escapedUrl = fullUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    xml = xml.replace(
      new RegExp(`(<loc>${escapedUrl}<\\/loc>[\\s\\S]*?<lastmod>)(\\d{4}-\\d{2}-\\d{2})(<\\/lastmod>)`),
      (match, before, date, after) => {
        if (date !== fileDate) {
          changed = true
          updates.push(`${r.page.file}: ${date} -> ${fileDate}`)
          return before + fileDate + after
        }
        return match
      }
    )
  }

  if (changed) fs.writeFileSync(sitemapPath, xml, 'utf-8')
  return { changed, updates }
}

function printReport(results, sitemapResult) {
  const line = '='.repeat(65)
  const today = new Date().toISOString().split('T')[0]

  console.log(line)
  console.log(`GAINFULLY SEO AUDIT  ${today}`)
  console.log(line)

  let totalScore = 0
  let totalCriticals = 0
  let totalWarnings = 0

  for (const r of results) {
    const icon = r.score >= 90 ? 'OK' : r.score >= 70 ? '~~' : '!!'
    console.log(`\n[${icon} ${String(r.score).padStart(3)}/100]  ${r.page.file}`)

    if (r.title) {
      const t = r.title
      console.log(`         Title: "${t.length > 55 ? t.substring(0, 53) + '...' : t}" (${t.length}c)`)
    }
    if (r.canonical) console.log(`     Canonical: ${r.canonical}`)
    if (r.desc)      console.log(`   Description: ${r.desc}`)

    if (r.issues.length === 0) {
      console.log('         Alle tjek bestaaet')
    } else {
      for (const issue of r.issues) {
        const label = issue.level === 'critical' ? '  CRITICAL:' : '     ADVAR:'
        console.log(`  ${label} ${issue.msg}`)
        if (issue.level === 'critical') totalCriticals++
        else totalWarnings++
      }
    }

    totalScore += r.score
  }

  const avgScore = Math.round(totalScore / results.length)

  console.log(`\n${line}`)
  console.log(`SCORE: ${avgScore}/100  |  ${results.length} sider  |  ${totalCriticals} kritiske  |  ${totalWarnings} advarsler`)

  if (sitemapResult.changed) {
    console.log(`\nAUTO-FIX sitemap.xml: ${sitemapResult.updates.length} dato(er) opdateret`)
    sitemapResult.updates.forEach(u => console.log(`  - ${u}`))
  } else {
    console.log('\nsitemap.xml: alle datoer er aktuelle')
  }

  console.log(line)
  return { avgScore, totalCriticals, totalWarnings }
}

// --- Main ---
const results = PAGES.map(auditPage)
const sitemapResult = updateSitemap(results)
const { totalCriticals } = printReport(results, sitemapResult)

if (totalCriticals > 0) {
  console.error(`\nAudit fejlet: ${totalCriticals} kritisk(e) problem(er) fundet`)
  process.exit(1)
}
