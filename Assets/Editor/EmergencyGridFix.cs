using UnityEngine;
using UnityEditor;

public class EmergencyGridFix : MonoBehaviour
{
    [MenuItem("Tools/Emergency Grid Fix")]
    public static void FixGrid()
    {
        // BoardManager'daki offset değerini sıfırla
        GameObject board = GameObject.Find("BoardManager");
        if (board != null)
        {
            BoardManager boardManager = board.GetComponent<BoardManager>();
            if (boardManager != null)
            {
                // Inspector'dan offset değerini 1.0f yap
                Debug.Log("Offset should be 1.0f in BoardManager inspector");
            }
        }
        
        // Tüm şekerlerin Z pozisyonunu sıfırla
        string[] prefabPaths = {
            "Assets/Prefabs/Red.prefab",
            "Assets/Prefabs/Blue.prefab", 
            "Assets/Prefabs/Green.prefab",
            "Assets/Prefabs/Yellow.prefab",
            "Assets/Prefabs/Purple.prefab"
        };
        
        foreach (string path in prefabPaths)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null)
            {
                // Transform'ı sıfırla
                prefab.transform.position = Vector3.zero;
                prefab.transform.rotation = Quaternion.identity;
                prefab.transform.localScale = Vector3.one;
                
                Candy candy = prefab.GetComponent<Candy>();
                if (candy != null)
                {
                    if (path.Contains("Red"))
                        candy.candyType = Candy.CandyType.Red;
                    else if (path.Contains("Blue"))
                        candy.candyType = Candy.CandyType.Blue;
                    else if (path.Contains("Green"))
                        candy.candyType = Candy.CandyType.Green;
                    else if (path.Contains("Yellow"))
                        candy.candyType = Candy.CandyType.Yellow;
                    else if (path.Contains("Purple"))
                        candy.candyType = Candy.CandyType.Magenta;
                    
                    candy.candyId = (int)candy.candyType;
                    candy.candyID = (int)candy.candyType;
                    
                    EditorUtility.SetDirty(candy);
                }
                
                PrefabUtility.SaveAsPrefabAsset(prefab, path);
            }
        }
        
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Emergency grid fix completed!");
    }
}
