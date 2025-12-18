// import './App.css';
import DCREProductionDemo from './dcre';
import DCREMeshApp from './dcre_mesh_app';

function DCREDemoWrapper() {
  return (
    <div className="DCREDemoWrapper">
      <DCREProductionDemo />
      <DCREMeshApp />
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <DCREDemoWrapper />
    </div>
  );
}

export default App;
