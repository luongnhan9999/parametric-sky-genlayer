import unittest
import sys
import os

# Add paths to make sure files can import contracts and tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tests")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "contracts")))

if __name__ == "__main__":
    print("Verifying contract syntax and running Mock GenLayer tests...")
    loader = unittest.TestLoader()
    suite = loader.discover(
        start_dir=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tests")),
        pattern="test_*.py"
    )
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print("\nSUCCESS: Intelligent Contract syntax and execution matches GenLayer mock VM expectations!")
        sys.exit(0)
    else:
        print("\nFAILURE: One or more unit tests failed.")
        sys.exit(1)
