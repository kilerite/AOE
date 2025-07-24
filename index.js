import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createClient } from '@supabase/supabase-js';

// Compatibilidad con ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// ✅ Supabase config (usa variables de entorno seguras en Render)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middlewares
app.use(cors());
app.use(express.json());
// app.use(express.static(path.join(__dirname, '../dist')));

// 🧠 Simulación de respuestas de modelos LLM (puedes reemplazar por APIs reales)
const mockLLMResponses = {
  Gemini: (question) => `Gemini response to: "${question}"`,
  ChatGPT: (question) => `ChatGPT response to: "${question}"`,
  Claude: (question) => `Claude response to: "${question}"`
};

async function callLLMAPI(model, question) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
  return mockLLMResponses[model](question);
}

// 📌 API para enviar una pregunta y recibir respuestas de los modelos
app.post('/api/preguntar', async (req, res) => {
  const { texto_pregunta } = req.body;
  if (!texto_pregunta) return res.status(400).json({ error: 'texto_pregunta is required' });

  const { data: pregunta, error: preguntaError } = await supabase
    .from('preguntas')
    .insert([{ texto_pregunta }])
    .select()
    .single();

  if (preguntaError) return res.status(500).json({ error: 'Error al guardar la pregunta' });

  const models = ['Gemini', 'ChatGPT', 'Claude'];
  const respuestas = {};

  for (const model of models) {
    try {
      const respuesta = await callLLMAPI(model, texto_pregunta);
      respuestas[model] = respuesta;

      await supabase.from('respuestas').insert([{
        id_pregunta: pregunta.id,
        modelo_llm: model,
        texto_respuesta: respuesta
      }]);
    } catch (error) {
      respuestas[model] = `Error en modelo ${model}`;
    }
  }

  res.json({ pregunta_id: pregunta.id, respuestas });
});

// 📊 API para dashboard (conteo de menciones de marcas por modelo)
app.get('/api/dashboard-data', async (req, res) => {
  try {
    const { data: marcas } = await supabase.from('marcas').select('*');
    const { data: respuestas } = await supabase.from('respuestas').select('*');

    const brandMentions = {};
    const modelBrandMentions = {};

    marcas.forEach(marca => {
      brandMentions[marca.nombre_marca] = 0;
      modelBrandMentions[marca.nombre_marca] = {
        Gemini: 0,
        ChatGPT: 0,
        Claude: 0
      };
    });

    respuestas.forEach(respuesta => {
      const texto = respuesta.texto_respuesta.toLowerCase();
      const modelo = respuesta.modelo_llm;
      marcas.forEach(marca => {
        const nombre = marca.nombre_marca.toLowerCase();
        const count = (texto.match(new RegExp(nombre, 'g')) || []).length;
        if (count > 0) {
          brandMentions[marca.nombre_marca] += count;
          modelBrandMentions[marca.nombre_marca][modelo] += count;
        }
      });
    });

    res.json({
      brandMentions,
      modelBrandMentions,
      pieChartData: {
        labels: Object.keys(brandMentions),
        data: Object.values(brandMentions)
      },
      totalResponses: respuestas.length,
      totalBrands: marcas.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Error interno al procesar dashboard' });
  }
});

// CRUD para marcas
app.get('/api/marcas', async (req, res) => {
  const { data, error } = await supabase.from('marcas').select('*').order('nombre_marca');
  if (error) return res.status(500).json({ error: 'Error al obtener marcas' });
  res.json(data);
});

app.post('/api/marcas', async (req, res) => {
  const { nombre_marca } = req.body;
  if (!nombre_marca) return res.status(400).json({ error: 'nombre_marca requerido' });

  const { data, error } = await supabase.from('marcas').insert([{ nombre_marca }]).select().single();
  if (error) return res.status(500).json({ error: 'Error al guardar marca' });
  res.json(data);
});

app.delete('/api/marcas/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('marcas').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'Error al eliminar marca' });
  res.json({ success: true });
});

// Consultar preguntas y sus respuestas
app.get('/api/preguntas', async (req, res) => {
  const { data, error } = await supabase.from('preguntas').select(`
    *,
    respuestas (
      id,
      modelo_llm,
      texto_respuesta,
      created_at
    )
  `).order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Error al obtener preguntas' });
  res.json(data);
});

// Redireccionar a React en cualquier otra ruta
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`✅ AEO Tracker backend listo en puerto ${port}`);
});
