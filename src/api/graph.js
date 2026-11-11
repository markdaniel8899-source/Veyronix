import service, { API_TIMEOUT_MS } from './index'

/**
 * generate ontology（upload documents and simulation requirement）
 * @param {Object} data - include files, simulation_requirement, project_name etc.
 * @returns {Promise}
 */
export function generateOntology(formData) {
  // Content-Type is deliberately NOT set here: the browser has to add the
  // multipart boundary itself, otherwise the backend cannot parse the files.
  console.log(
    '[API] -> POST /api/graph/ontology/generate',
    {
      files: formData?.getAll?.('files')?.length ?? 0,
      simulation_requirement: formData?.get?.('simulation_requirement') ?? null
    }
  );

  return service({
    url: '/api/graph/ontology/generate',
    method: 'post',
    data: formData,
    timeout: API_TIMEOUT_MS
  })
}

/**
 * build the graph
 * @param {Object} data - include project_id, graph_name etc.
 * @returns {Promise}
 */
export function buildGraph(data) {
  return service({
    url: '/api/graph/build',
    method: 'post',
    data
  })
}

/**
 * query task status
 * @param {String} taskId - task ID
 * @returns {Promise}
 */
export function getTaskStatus(taskId) {
  return service({
    url: `/api/graph/task/${taskId}`,
    method: 'get'
  })
}

/**
 * get graph data
 * @param {String} graphId - graph ID
 * @returns {Promise}
 */
export function getGraphData(graphId) {
  return service({
    url: `/api/graph/data/${graphId}`,
    method: 'get'
  })
}

/**
 * get project information
 * @param {String} projectId - project ID
 * @returns {Promise}
 */
export function getProject(projectId) {
  return service({
    url: `/api/graph/project/${projectId}`,
    method: 'get'
  })
}
