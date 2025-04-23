import "./App.css";
import { CategoryView, useCategory } from "./modules/Category";

function App() {
  const categoryViewModel = useCategory();

  return (
    <div>
      <CategoryView {...categoryViewModel} />
    </div>
  );
}

export default App;
