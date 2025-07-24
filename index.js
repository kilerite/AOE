import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = process.env.PORT || 3001;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors());
app.use(express.json());

// Simulación de respuestas de LLMs
const mockLLMResponses = {
  Gemini: (q) => `Gemini response to: "${q}"`,
  ChatGPT: (q) => `ChatGPT response to: "${q}"`,
  Claude: (q) => `Claude response to: "${q}"`
};

async function callLLMAPI(model, question) {
  await new Promise((r) => setTimeout(r, Math.random() * 2000 + 1000));
  return mockLLMResponses[model](question);
}

// --- API Routes ---

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
    } catch {
      respuestas[model] = `Error en modelo ${model}`;
    }
  }

  res.json({ pregunta_id: pregunta.id, respuestas });
});

app.get('/api/dashboard-data', async (req, res) => {
  try {
    const { data: marcas } = await supabase.from('marcas').select('*');
    const { data: respuestas } = await supabase.from('respuestas').select('*');

    const brandMentions = {};
    const modelBrandMentions = {};

    marcas.forEach(m => {
      brandMentions[m.nombre_marca] = 0;
      modelBrandMentions[m.nombre_marca] = {
        Gemini: 0,
        ChatGPT: 0,
        Claude: 0
      };
    });

    respuestas.forEach(r => {
      const texto = r.texto_respuesta.toLowerCase();
      const modelo = r.modelo_llm;
      marcas.forEach(m => {
        const nombre = m.nombre_marca.toLowerCase();
        const count = (texto.match(new RegExp(nombre, 'g')) || []).length;
        if (count > 0) {
          brandMentions[m.nombre_marca] += count;
          modelBrandMentions[m.nombre_marca][modelo] += count;
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
  } catch {
    res.status(500).json({ error: 'Error en dashboard-data' });
  }
});

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

// Start
app.listen(port, () => {
  console.log(`✅ AEO Tracker backend listo en puerto ${port}`);
});
