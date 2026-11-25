# Fórmulas Matemáticas de Indicadores Dinámicos — COMMUNITY 360

Este documento define las fórmulas exactas utilizadas por el backend (`src/services/analytics.service.js`) y visualizadas en tiempo real en el dashboard de **Community 360** (Fases 4, 5 y 6). Todos los indicadores se calculan 100% con registros reales almacenados en Amazon RDS (MariaDB) y Amazon DynamoDB, y se recalculan automáticamente ante cada operación `POST`, `PUT`, `PATCH` o `DELETE` sobre `/api/interacciones` (emitiéndose inmediatamente vía WebSockets `analytics:actualizado`).

---

## 1. Indicadores de Actividad Comunitaria (Dinámicos en Tiempo Real)

Sea $I = \{i_1, i_2, \dots, i_N\}$ el conjunto de interacciones válidas registradas en `community360_interacciones`, donde $N = |I|$:

### 1.1 Total de actividad comunitaria ($N$)
$$N = |I|$$
- **Campo JSON:** `total_interacciones_validas`
- **Comportamiento dinámico:** Se incrementa en $+1$ tras un `POST /api/interacciones` (o reproceso desde cuarentena) y disminuye en $-1$ tras un `DELETE /api/interacciones/:id`.

### 1.2 Sentimiento promedio de la actividad ($\bar{s}_{\text{act}}$)
$$\bar{s}_{\text{act}} = \frac{1}{N_s} \sum_{i=1}^{N_s} s_i, \quad s_i \in [-1, 1]$$
- Donde $s_i$ es el valor numérico de `sentimiento` de cada interacción y $N_s$ es el número de interacciones con sentimiento válido.
- **Campo JSON:** `sentimiento_interacciones_promedio` (redondeado a 4 decimales).
- **Interpretación:**
  - $\bar{s}_{\text{act}} \ge 0.35$: Muy positivo
  - $0.05 \le \bar{s}_{\text{act}} < 0.35$: Positivo
  - $-0.15 < \bar{s}_{\text{act}} < 0.05$: Neutral
  - $\bar{s}_{\text{act}} \le -0.15$: En alerta

### 1.3 Tasa de positividad de la actividad ($P_{+}$)
$$P_{+} = \frac{|\{i \in I \mid s_i \ge 0.05\}|}{N_s} \times 100$$
- **Campo JSON:** `tasa_positividad_actividad` (porcentaje `%`, 2 decimales).

### 1.4 Promedio de reacciones por actividad ($\bar{r}$)
$$\bar{r} = \frac{1}{N} \sum_{i=1}^{N} r_i, \quad r_i \ge 0$$
- Donde $r_i$ corresponde a `reacciones_recibidas` de la interacción $i$, y el acumulado total es $R = \sum_{i=1}^{N} r_i$.
- **Campos JSON:** `promedio_reacciones` (2 decimales) y `total_reacciones`.

### 1.5 Tasa de participación por canal ($T_c$)
Para cada canal $c \in C$ (ej. Discord, Instagram, Telegram, TikTok, Twitter/X, Facebook):
$$n_c = |\{i \in I \mid \text{canal}(i) = c\}|, \qquad T_c = \frac{n_c}{N} \times 100$$
- **Campo JSON:** `canales[].total` ($n_c$) y `canales[].tasa_participacion` ($T_c$, porcentaje `%` con 2 decimales).
- **Propiedad de consistencia:** $\sum_{c \in C} T_c \approx 100\%$.

---

## 2. Indicadores de Comunidad y Privacidad (Base Relacional)

Sea $U$ el conjunto de miembros registrados en `usuarios`, con $M = |U|$:

### 2.1 Tasa de miembros activos ($A_{\%}$)
$$A_{\%} = \frac{|\{u \in U \mid \text{estatus}(u) = \text{'activo'}\}|}{M} \times 100$$
- **Campos JSON:** `total_usuarios` ($M$), `activos`, `en_riesgo`, `inactivos`.

### 2.2 Tasa de consentimiento de ubicación ($C_{\text{si}}$) y exclusión por privacidad ($C_{\text{no}}$)
$$C_{\text{si}} = \frac{|\{u \in U \mid \text{consentimiento}(u) = \text{'si'}\}|}{M} \times 100, \qquad N_{\text{protegidos}} = |\{u \in U \mid \text{consentimiento}(u) = \text{'no'}\}|$$
- **Regla de privacidad estricta:** Los $N_{\text{protegidos}}$ miembros sin consentimiento tienen `ciudad_id = NULL`, `latitud = NULL` y `longitud = NULL`, por lo que quedan **100% excluidos** del mapa de calor y de las métricas geográficas.

### 2.3 Sentimiento promedio ponderado por país ($\bar{s}_p$)
Para cada país $p$ usando únicamente miembros con `consentimiento_datos = 'si'`:
$$\bar{s}_p = \frac{\sum_{j \in \text{ciudades}(p)} \bar{s}_{p,j} \cdot u_{p,j}}{\sum_{j \in \text{ciudades}(p)} u_{p,j}}$$
- Donde $u_{p,j}$ es el número de miembros autorizados en la ciudad $j$ del país $p$ y $\bar{s}_{p,j}$ su sentimiento promedio.
- **Campo JSON:** `por_pais[].sentimiento_promedio`.

---

## 3. Intensidad en el Mapa de Calor (`leaflet.heat`)

Cada punto geográfico autorizado $(lat_k, lon_k)$ proyectado en el mapa de calor recibe un peso normalizado de intensidad $w_k \in [0.28, 1.00]$ derivado del sentimiento promedio del miembro:
$$w_k = \min\!\left(1.0,\ \max\!\left(0.28,\ \frac{s_k + 1}{2}\right)\right)$$
- Garantiza visibilidad mínima para todos los puntos autorizados mientras resalta visualmente las zonas con mayor concentración y clima comunitario positivo.

---

## 4. Flujo de Consistencia en Tiempo Real (Fase 5)

1. Postman envía `POST /api/interacciones`, `PUT /api/interacciones/:id`, `PATCH /api/interacciones/:id` o `DELETE /api/interacciones/:id` con JWT de administrador.
2. El servidor valida las reglas de integridad y privacidad, persiste el cambio en DynamoDB e invalida la caché de analítica.
3. El servidor emite por Socket.io el evento puntual (`interaccion:creada`, `interaccion:actualizada` o `interaccion:eliminada`).
4. Acto seguido, recalcula las fórmulas anteriores y emite `analytics:actualizado` a todos los clientes conectados.
5. Los dashboards (Administrador y Analista) actualizan tarjetas KPI, gráficas de barras/dona, mapa de calor y flujo de actividad **sin recargar la página**.
