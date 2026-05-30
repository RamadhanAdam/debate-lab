import pytest
from reward import QTableManager

def test_q_manager_update_and_save(tmp_path):
    import reward
    # Override the file path for tests
    reward.Q_TABLE_FILE = tmp_path / "test_q_table.json"
    
    qm = QTableManager()
    qm.update("state1", "gpt", 0.8, "state2")
    
    val = qm.get_q_value("state1", "gpt")
    assert val > 0.0
    
    qm.save()
    assert reward.Q_TABLE_FILE.exists()

def test_get_agent_stats():
    qm = QTableManager()
    qm.q_table = {
        "state1": {"gpt": 0.9, "groq": 0.5},
        "state2": {"gpt": 0.4, "groq": 0.8}
    }
    stats = qm.get_agent_stats()
    assert isinstance(stats, list)
    
    gpt_stat = next(s for s in stats if s["agent"] == "gpt")
    assert gpt_stat["total_debates"] == 2
    # One win in state1, groq wins state2
    assert gpt_stat["win_rate"] == 50

def test_get_best_agent_order():
    qm = QTableManager()
    qm.q_table = {
        "state1": {"gpt": 0.9, "groq": 0.5, "gemini": 0.1},
        "state2": {"gpt": 0.8, "groq": 0.6, "gemini": 0.2}
    }
    
    agents = ["gpt", "groq", "gemini"]
    ordered = qm.get_best_agent_order(agents)
    
    assert ordered == ["gpt", "groq", "gemini"]
