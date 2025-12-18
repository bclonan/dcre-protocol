// import './App.css';
import DCREProductionDemo from './dcre';

function DCREDemoWrapper() {
  return (
    <div className="DCREDemoWrapper">
      <DCREProductionDemo />
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
