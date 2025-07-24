import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Supabase client setup
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'your-supabase-url',
  process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key'
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

// Mock LLM API calls (placeholder functions)
const mockLLMResponses = {
  'Gemini': (question) => `Gemini response to: "${question}". This is a sample response that might mention Nike shoes and Apple products.`,
  'ChatGPT': (question) => `ChatGPT response to: "${question}". Here's a detailed answer that could reference Adidas clothing and Samsung devices.`,
  'Claude': (question) => `Claude response to: "${question}". This comprehensive answer may include mentions of Coca-Cola products and various brands.`
};

async function callLLMAPI(model, question) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
  return mockLLMResponses[model](question);
}

// API Routes
app.post('/api/preguntar', async (req, res) => {
  try {
    const { texto_pregunta } = req.body;
    
    if (!texto_pregunta) {
      return res.status(400).json({ error: 'texto_pregunta is required' });
    }

    // Insert question into database
    const { data: pregunta, error: preguntaError } = await supabase
      .from('preguntas')
      .insert([{ texto_pregunta }])
      .select()
      .single();

    if (preguntaError) {
      console.error('Error inserting question:', preguntaError);
      return res.status(500).json({ error: 'Failed to save question' });
    }

    // Get responses from all LLMs
    const models = ['Gemini', 'ChatGPT', 'Claude'];
    const responses = {};
    
    for (const model of models) {
      try {
        const respuesta = await callLLMAPI(model, texto_pregunta);
        responses[model] = respuesta;
        
        // Save response to database
        await supabase
          .from('respuestas')
          .insert([{
            id_pregunta: pregunta.id,
            modelo_llm: model,
            texto_respuesta: respuesta
          }]);
      } catch (error) {
        console.error(`Error with ${model}:`, error);
        responses[model] = `Error getting response from ${model}`;
      }
    }

    res.json({
      pregunta_id: pregunta.id,
      pregunta: texto_pregunta,
      respuestas: responses
    });

  } catch (error) {
    console.error('Error in /api/preguntar:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard-data', async (req, res) => {
  try {
    // Get all brands
    const { data: marcas, error: marcasError } = await supabase
      .from('marcas')
      .select('*');

    if (marcasError) {
      console.error('Error fetching brands:', marcasError);
      return res.status(500).json({ error: 'Failed to fetch brands' });
    }

    // Get all responses
    const { data: respuestas, error: respuestasError } = await supabase
      .from('respuestas')
      .select('*');

    if (respuestasError) {
      console.error('Error fetching responses:', respuestasError);
      return res.status(500).json({ error: 'Failed to fetch responses' });
    }

    // Analyze brand mentions
    const brandMentions = {};
    const modelBrandMentions = {};

    // Initialize counters
    marcas.forEach(marca => {
      brandMentions[marca.nombre_marca] = 0;
      modelBrandMentions[marca.nombre_marca] = {
        'Gemini': 0,
        'ChatGPT': 0,
        'Claude': 0
      };
    });

    // Count mentions
    respuestas.forEach(respuesta => {
      const texto = respuesta.texto_respuesta.toLowerCase();
      const modelo = respuesta.modelo_llm;
      
      marcas.forEach(marca => {
        const brandName = marca.nombre_marca.toLowerCase();
        const mentions = (texto.match(new RegExp(brandName, 'g')) || []).length;
        
        if (mentions > 0) {
          brandMentions[marca.nombre_marca] += mentions;
          if (modelBrandMentions[marca.nombre_marca][modelo] !== undefined) {
            modelBrandMentions[marca.nombre_marca][modelo] += mentions;
          }
        }
      });
    });

    // Prepare chart data
    const pieChartData = {
      labels: Object.keys(brandMentions),
      data: Object.values(brandMentions)
    };

    res.json({
      brandMentions,
      modelBrandMentions,
      pieChartData,
      totalResponses: respuestas.length,
      totalBrands: marcas.length
    });

  } catch (error) {
    console.error('Error in /api/dashboard-data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/marcas', async (req, res) => {
  try {
    const { data: marcas, error } = await supabase
      .from('marcas')
      .select('*')
      .order('nombre_marca');

    if (error) {
      console.error('Error fetching brands:', error);
      return res.status(500).json({ error: 'Failed to fetch brands' });
    }

    res.json(marcas);
  } catch (error) {
    console.error('Error in /api/marcas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/marcas', async (req, res) => {
  try {
    const { nombre_marca } = req.body;
    
    if (!nombre_marca) {
      return res.status(400).json({ error: 'nombre_marca is required' });
    }

    const { data: marca, error } = await supabase
      .from('marcas')
      .insert([{ nombre_marca }])
      .select()
      .single();

    if (error) {
      console.error('Error adding brand:', error);
      return res.status(500).json({ error: 'Failed to add brand' });
    }

    res.json(marca);
  } catch (error) {
    console.error('Error in POST /api/marcas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/marcas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('marcas')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting brand:', error);
      return res.status(500).json({ error: 'Failed to delete brand' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/marcas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/preguntas', async (req, res) => {
  try {
    const { data: preguntas, error } = await supabase
      .from('preguntas')
      .select(`
        *,
        respuestas (
          id,
          modelo_llm,
          texto_respuesta,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching questions:', error);
      return res.status(500).json({ error: 'Failed to fetch questions' });
    }

    res.json(preguntas);
  } catch (error) {
    console.error('Error in /api/preguntas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, () => {
  console.log(`AEO Tracker server running on port ${port}`);
});